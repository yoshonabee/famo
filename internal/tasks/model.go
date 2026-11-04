package tasks

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

var ErrConflict = errors.New("任務已被更新，請重新讀取後再操作")
var ErrNotFound = errors.New("找不到任務")
var ErrInvalid = errors.New("無效的輸入")

type Workflow struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Stages []string `json:"stages"`
}

// Workflows only seeds new databases. Runtime validation uses stored Settings.
var Workflows = []Workflow{
	{"development", "開發", []string{"待開始", "開發中", "PR review", "部署", "驗收"}},
	{"communication", "溝通", []string{"草擬", "已送出", "已確認"}},
	{"general", "一般", []string{"待開始", "處理中", "確認"}},
}

// Step is retained for existing API clients and archived task data.
type Step struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	CompletedAt *time.Time `json:"completed_at"`
}
type Link struct {
	Type string `json:"type"`
	URL  string `json:"url"`
}
type Event struct {
	Action  string    `json:"action"`
	Source  string    `json:"source"`
	Summary string    `json:"summary"`
	At      time.Time `json:"at"`
	Version int       `json:"version"`
}
type Task struct {
	ID            string         `json:"id"`
	Title         string         `json:"title"`
	Description   string         `json:"description"`
	Goal          string         `json:"goal"`
	Context       string         `json:"context"`
	Acceptance    string         `json:"acceptance"`
	Type          string         `json:"type"`
	Stage         string         `json:"stage"`
	Priority      int            `json:"priority"`
	WaitingReason string         `json:"waiting_reason"`
	WaitingSince  *time.Time     `json:"waiting_since"`
	ReviewAt      *time.Time     `json:"review_at"`
	CompletedAt   *time.Time     `json:"completed_at"`
	DeletedAt     *time.Time     `json:"deleted_at"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	Version       int            `json:"version"`
	Steps         []Step         `json:"steps"`
	Links         []Link         `json:"links"`
	Metadata      map[string]any `json:"metadata"`
	History       []Event        `json:"history"`
}
type CreateInput struct {
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Goal        string         `json:"goal"`
	Context     string         `json:"context"`
	Acceptance  string         `json:"acceptance"`
	Type        string         `json:"type"`
	Stage       string         `json:"stage"`
	Priority    int            `json:"priority"`
	Steps       []string       `json:"steps"`
	Links       []Link         `json:"links"`
	Metadata    map[string]any `json:"metadata"`
	Source      string         `json:"source"`
}
type Action struct {
	Op            string          `json:"op"`
	Version       int             `json:"version"`
	Source        string          `json:"source"`
	StepID        string          `json:"step_id"`
	NextStep      *string         `json:"next_step"`
	WaitingReason *string         `json:"waiting_reason"`
	ReviewAt      *string         `json:"review_at"`
	Stage         *string         `json:"stage"`
	Links         []Link          `json:"links"`
	Title         *string         `json:"title"`
	Description   *string         `json:"description"`
	Type          *string         `json:"type"`
	Goal          *string         `json:"goal"`
	Context       *string         `json:"context"`
	Acceptance    *string         `json:"acceptance"`
	Priority      *int            `json:"priority"`
	Metadata      *map[string]any `json:"metadata"`
}

func id() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func source(s string) string {
	if strings.TrimSpace(s) == "" {
		return "ui"
	}
	return strings.TrimSpace(s)
}
func validate(t Task) error {
	if strings.TrimSpace(t.Title) == "" {
		return errors.New("請填寫任務名稱")
	}

	for _, l := range t.Links {
		u, e := url.Parse(l.URL)
		if e != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || strings.TrimSpace(l.Type) == "" {
			return errors.New("連結需要類型與有效的 HTTP / HTTPS URL")
		}
	}
	return nil
}
func newTask(in CreateInput, now time.Time) (Task, error) {
	t := Task{ID: id(), Title: strings.TrimSpace(in.Title), Description: in.Description, Goal: in.Goal, Context: in.Context, Acceptance: in.Acceptance, Type: in.Type, Stage: in.Stage, Priority: in.Priority, Version: 1, CreatedAt: now, UpdatedAt: now, Steps: []Step{}, Links: in.Links, Metadata: in.Metadata, History: []Event{}}
	if t.Links == nil {
		t.Links = []Link{}
	}
	if t.Metadata == nil {
		t.Metadata = map[string]any{}
	}
	for _, s := range in.Steps {
		if strings.TrimSpace(s) != "" {
			t.Steps = append(t.Steps, Step{ID: id(), Title: strings.TrimSpace(s)})
		}
	}
	if t.Description == "" {
		parts := []string{}
		for _, f := range []struct{ label, value string }{{"目標", t.Goal}, {"背景脈絡", t.Context}, {"驗收條件", t.Acceptance}} {
			if strings.TrimSpace(f.value) != "" {
				parts = append(parts, f.label+"\n"+f.value)
			}
		}
		t.Description = strings.Join(parts, "\n\n")
	}
	t.History = append(t.History, Event{"create", source(in.Source), "建立任務", now, 1})
	return t, validate(t)
}
func apply(t *Task, a Action, now time.Time) error {
	if t.CompletedAt != nil && a.Op != "reopen_task" && a.Op != "reopen_step" && a.Op != "rename" && a.Op != "update" && a.Op != "delete_item" {
		return errors.New("任務已完成")
	}
	summary := ""
	switch a.Op {
	case "rename":
		if a.Title == nil || strings.TrimSpace(*a.Title) == "" {
			return errors.New("標題不可空白")
		}
		title := strings.TrimSpace(*a.Title)
		if a.StepID == "" {
			t.Title = title
			summary = "重新命名任務：" + title
		} else {
			found := false
			for i := range t.Steps {
				if t.Steps[i].ID == a.StepID {
					t.Steps[i].Title = title
					found = true
					break
				}
			}
			if !found {
				return errors.New("找不到步驟")
			}
			summary = "重新命名步驟：" + title
		}
	case "delete_item":
		if a.StepID == "" {
			t.DeletedAt = &now
			summary = "刪除任務：" + t.Title
		} else {
			found := false
			for i, step := range t.Steps {
				if step.ID == a.StepID {
					summary = "刪除步驟：" + step.Title
					t.Steps = append(t.Steps[:i], t.Steps[i+1:]...)
					found = true
					break
				}
			}
			if !found {
				return errors.New("找不到步驟")
			}
		}
	case "reopen_task":
		if t.CompletedAt == nil {
			return errors.New("任務尚未完成")
		}
		t.CompletedAt = nil
		summary = "恢復為未完成"
	case "reopen_step":
		found := false
		for i := range t.Steps {
			if t.Steps[i].ID == a.StepID && t.Steps[i].CompletedAt != nil {
				t.Steps[i].CompletedAt = nil
				summary = "恢復步驟：" + t.Steps[i].Title
				found = true
				break
			}
		}
		if !found {
			return errors.New("找不到已完成的步驟")
		}
		t.CompletedAt = nil
	case "complete_step":
		found := false
		for i := range t.Steps {
			if t.Steps[i].ID == a.StepID && t.Steps[i].CompletedAt == nil {
				t.Steps[i].CompletedAt = &now
				found = true
				summary = "完成步驟：" + t.Steps[i].Title
				break
			}
		}
		if !found {
			return errors.New("找不到尚未完成的步驟")
		}
	case "update_next_step":
		if a.NextStep == nil || strings.TrimSpace(*a.NextStep) == "" {
			return errors.New("請填寫下一步")
		}
		summary = "更新下一步"
	case "set_waiting":
		if a.WaitingReason == nil || strings.TrimSpace(*a.WaitingReason) == "" {
			return errors.New("請填寫等待原因")
		}
		summary = "設定等待"
	case "resume":
		t.WaitingReason = ""
		t.WaitingSince = nil
		t.ReviewAt = nil
		summary = "回到可繼續"
	case "add_link":
		if len(a.Links) == 0 {
			return errors.New("請提供相關連結")
		}
		summary = "新增相關連結"
	case "update":
		if a.Description != nil {
			t.Description = *a.Description
		}
		if a.Type != nil {
			t.Type = *a.Type
		}
		if a.Title != nil {
			t.Title = strings.TrimSpace(*a.Title)
		}
		if a.Goal != nil {
			t.Goal = *a.Goal
		}
		if a.Context != nil {
			t.Context = *a.Context
		}
		if a.Acceptance != nil {
			t.Acceptance = *a.Acceptance
		}
		if a.Priority != nil {
			t.Priority = *a.Priority
		}
		if a.Metadata != nil {
			t.Metadata = *a.Metadata
		}
		summary = "更新任務內容"
	case "complete_task":
		t.CompletedAt = &now
		t.WaitingReason = ""
		t.WaitingSince = nil
		t.ReviewAt = nil
		summary = "完成整件任務"
	default:
		return errors.New("不支援的操作")
	}
	if a.NextStep != nil && strings.TrimSpace(*a.NextStep) != "" {
		next := strings.TrimSpace(*a.NextStep)
		found := false
		for i := range t.Steps {
			if t.Steps[i].CompletedAt == nil {
				t.Steps[i].Title = next
				found = true
				break
			}
		}
		if !found {
			t.Steps = append(t.Steps, Step{ID: id(), Title: next})
		}
	}
	if a.Stage != nil {
		t.Stage = *a.Stage
	}
	if a.WaitingReason != nil && a.Op != "complete_task" && a.Op != "resume" {
		t.WaitingReason = strings.TrimSpace(*a.WaitingReason)
		if t.WaitingReason == "" {
			t.WaitingSince = nil
		} else if t.WaitingSince == nil {
			t.WaitingSince = &now
		}
	}
	if a.ReviewAt != nil && a.Op != "complete_task" && a.Op != "resume" {
		if *a.ReviewAt == "" {
			t.ReviewAt = nil
		} else {
			v, e := time.Parse(time.RFC3339, *a.ReviewAt)
			if e != nil {
				return errors.New("下次查看時間須為 RFC3339")
			}
			t.ReviewAt = &v
		}
	}
	t.Links = append(t.Links, a.Links...)
	if err := validate(*t); err != nil {
		return err
	}
	t.Version++
	t.UpdatedAt = now
	if a.WaitingReason != nil && t.WaitingReason != "" {
		summary += fmt.Sprintf(" · 等待 %s", t.WaitingReason)
	}
	t.History = append(t.History, Event{a.Op, source(a.Source), summary, now, t.Version})
	return nil
}
