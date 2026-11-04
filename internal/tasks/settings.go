package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Option struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	Disabled bool   `json:"disabled"`
}
type ConfigWorkflow struct {
	Option
	Stages       []Option `json:"stages"`
	DefaultStage string   `json:"default_stage"`
}
type ColorPreset struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

var optionColors = []ColorPreset{
	{"草莓奶昔", "#F4B8CB"}, {"蜜桃布丁", "#F7C5AB"},
	{"奶油餅乾", "#F5DFA0"}, {"開心果", "#C9DFAD"},
	{"薄荷糖", "#ADE0D2"}, {"晴空棉花糖", "#B5D8F5"},
	{"薰衣草", "#CFC1F0"}, {"葡萄軟糖", "#E3BCE0"},
	{"玫瑰馬卡龍", "#EBA5B3"}, {"珊瑚果凍", "#F3B6AE"},
	{"橘子汽水", "#F6CF9F"}, {"檸檬雪酪", "#EEE6AD"},
	{"青蘋果", "#D9E8B8"}, {"海鹽蘇打", "#AEDBDF"},
	{"藍莓優格", "#BAC9EB"}, {"可可奶茶", "#DCCABD"},
}

type Settings struct {
	ColorPresets    []ColorPreset    `json:"color_presets"`
	Version         int              `json:"version"`
	Workflows       []ConfigWorkflow `json:"workflows"`
	Priorities      []Option         `json:"priorities"`
	DefaultType     string           `json:"default_type"`
	DefaultPriority int              `json:"default_priority"`
}

func defaultSettings() Settings {
	cfg := Settings{Version: 1, DefaultType: "general", DefaultPriority: 1, Priorities: []Option{
		{ID: "2", Name: "優先處理", Color: optionColors[0].Color}, {ID: "1", Name: "一般", Color: optionColors[4].Color}, {ID: "0", Name: "之後再做", Color: optionColors[6].Color},
	}}
	for index, w := range Workflows {
		item := ConfigWorkflow{Option: Option{ID: w.ID, Name: w.Name, Color: optionColors[(index+4)%len(optionColors)].Color}, DefaultStage: w.Stages[0]}
		for i, stage := range w.Stages {
			item.Stages = append(item.Stages, Option{ID: stage, Name: stage, Color: optionColors[i%len(optionColors)].Color})
		}
		cfg.Workflows = append(cfg.Workflows, item)
	}
	cfg.ColorPresets = optionColors
	return cfg
}
func (s *Store) Settings(ctx context.Context) (Settings, error) {
	var raw string
	if err := s.db.QueryRowContext(ctx, `SELECT document FROM settings WHERE id=1`).Scan(&raw); err != nil {
		return Settings{}, err
	}
	var cfg Settings
	err := json.Unmarshal([]byte(raw), &cfg)
	cfg.ColorPresets = optionColors
	return cfg, err
}

var optionColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func checkOptions(options []Option, numeric bool) error {
	seen := map[string]bool{}
	names := map[string]bool{}
	for _, o := range options {
		if strings.TrimSpace(o.ID) == "" || strings.TrimSpace(o.Name) == "" || seen[o.ID] || !optionColor.MatchString(o.Color) {
			return fmt.Errorf("選項需要唯一 ID、名稱與有效色碼")
		}
		if !o.Disabled && names[strings.TrimSpace(o.Name)] {
			return fmt.Errorf("啟用中的選項名稱不可重複")
		}
		if !o.Disabled {
			names[strings.TrimSpace(o.Name)] = true
		}
		if numeric {
			n, e := strconv.Atoi(o.ID)
			if e != nil || n < 0 || strconv.Itoa(n) != o.ID {
				return fmt.Errorf("優先順序 ID 必須為非負整數")
			}
		}
		seen[o.ID] = true
	}
	return nil
}
func findOption(options []Option, id string) *Option {
	for i := range options {
		if options[i].ID == id {
			return &options[i]
		}
	}
	return nil
}
func (c Settings) workflow(id string) *ConfigWorkflow {
	for i := range c.Workflows {
		if c.Workflows[i].ID == id {
			return &c.Workflows[i]
		}
	}
	return nil
}
func (c Settings) validateTask(t Task, before *Task) error {
	w := c.workflow(t.Type)
	if w == nil {
		return fmt.Errorf("無效的任務類型")
	}
	unchangedType := before != nil && before.Type == t.Type
	if w.Disabled && !unchangedType {
		return fmt.Errorf("任務類型已停用")
	}
	stage := findOption(w.Stages, t.Stage)
	if stage == nil || (stage.Disabled && !(unchangedType && before.Stage == t.Stage)) {
		return fmt.Errorf("無效或已停用的流程階段")
	}
	priority := findOption(c.Priorities, strconv.Itoa(t.Priority))
	if priority == nil || (priority.Disabled && !(before != nil && before.Priority == t.Priority)) {
		return fmt.Errorf("無效或已停用的優先順序")
	}
	return nil
}
func (s *Store) SaveSettings(ctx context.Context, c Settings) (Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	old, err := s.Settings(ctx)
	if err != nil {
		return Settings{}, err
	}
	if old.Version != c.Version {
		return Settings{}, ErrConflict
	}
	options := []Option{}
	for _, w := range c.Workflows {
		options = append(options, w.Option)
		if err = checkOptions(w.Stages, false); err != nil {
			return Settings{}, fmt.Errorf("%w：%v", ErrInvalid, err)
		}
		if !w.Disabled {
			stage := findOption(w.Stages, w.DefaultStage)
			if stage == nil || stage.Disabled {
				return Settings{}, fmt.Errorf("%w：需要啟用中的預設階段", ErrInvalid)
			}
		}
	}
	if err = checkOptions(options, false); err != nil {
		return Settings{}, fmt.Errorf("%w：%v", ErrInvalid, err)
	}
	if err = checkOptions(c.Priorities, true); err != nil {
		return Settings{}, fmt.Errorf("%w：%v", ErrInvalid, err)
	}
	w := c.workflow(c.DefaultType)
	p := findOption(c.Priorities, strconv.Itoa(c.DefaultPriority))
	if w == nil || w.Disabled || p == nil || p.Disabled {
		return Settings{}, fmt.Errorf("%w：需要啟用中的預設類型與優先順序", ErrInvalid)
	}
	// Deleting options and moving their references share one transaction.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT document FROM tasks`)
	if err != nil {
		return Settings{}, err
	}
	updates := []Task{}
	now := time.Now().UTC()
	for rows.Next() {
		var raw string
		if err = rows.Scan(&raw); err != nil {
			rows.Close()
			return Settings{}, err
		}
		var task Task
		if err = json.Unmarshal([]byte(raw), &task); err != nil {
			rows.Close()
			return Settings{}, err
		}
		changed := false
		workflow := c.workflow(task.Type)
		if workflow == nil {
			task.Type = c.DefaultType
			workflow = c.workflow(task.Type)
			task.Stage = workflow.DefaultStage
			changed = true
		} else if findOption(workflow.Stages, task.Stage) == nil {
			fallback := workflow.DefaultStage
			if option := findOption(workflow.Stages, fallback); option == nil || option.Disabled {
				// A disabled type still needs an enabled stage when its current stage is deleted.
				fallback = ""
				for _, stage := range workflow.Stages {
					if !stage.Disabled {
						fallback = stage.ID
						break
					}
				}
			}
			if fallback == "" {
				rows.Close()
				return Settings{}, fmt.Errorf("%w：刪除使用中的階段前，需保留一個啟用中的替代階段", ErrInvalid)
			}
			task.Stage = fallback
			changed = true
		}
		if findOption(c.Priorities, strconv.Itoa(task.Priority)) == nil {
			task.Priority = c.DefaultPriority
			changed = true
		}
		if changed {
			task.Version++
			task.UpdatedAt = now
			task.History = append(task.History, Event{Action: "replace_deleted_option", Source: "settings", Summary: "刪除選項，改用預設類型、階段或優先順序", At: now, Version: task.Version})
			updates = append(updates, task)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Settings{}, err
	}
	for _, task := range updates {
		raw, err := json.Marshal(task)
		if err != nil {
			return Settings{}, err
		}
		result, err := tx.ExecContext(ctx, `UPDATE tasks SET type=?,stage=?,priority=?,version=?,document=? WHERE id=? AND version=?`, task.Type, task.Stage, task.Priority, task.Version, string(raw), task.ID, task.Version-1)
		if err != nil {
			return Settings{}, err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return Settings{}, err
		}
		if count != 1 {
			return Settings{}, ErrConflict
		}
	}
	c.ColorPresets = optionColors
	c.Version++
	raw, err := json.Marshal(c)
	if err != nil {
		return Settings{}, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE settings SET version=?,document=? WHERE id=1 AND version=?`, c.Version, string(raw), old.Version)
	if err != nil {
		return Settings{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return Settings{}, err
	}
	if count != 1 {
		return Settings{}, ErrConflict
	}
	if err = tx.Commit(); err != nil {
		return Settings{}, err
	}
	return c, nil
}
