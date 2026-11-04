package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

func TestDescriptionMigrationPreservesLegacyDataAndOrder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	a := createTest(t, s)
	b := createTest(t, s)
	deleted := createTest(t, s)
	if _, err = s.Act(ctx, deleted.ID, Action{Op: "delete_item", Version: deleted.Version}); err != nil {
		t.Fatal(err)
	}
	if err = s.Reorder(ctx, []string{b.ID, a.ID}); err != nil {
		t.Fatal(err)
	}
	// Recreate a v3 document, including a soft-deleted task, without description.
	if _, err = s.db.Exec(`UPDATE tasks SET document=json_remove(document,'$.description'); DROP TABLE settings; PRAGMA user_version=3;`); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	expected := "目標\n使用者能登入\n\n背景脈絡\nSlack 討論中的問題\n\n驗收條件\n測試通過"
	if got.Description != expected || got.Goal != a.Goal || len(got.Steps) != 2 || got.Version != a.Version || len(got.History) != len(a.History) {
		t.Fatalf("migration lost data: %+v", got)
	}
	var deletedRaw string
	if err = s.db.QueryRow(`SELECT document FROM tasks WHERE id=?`, deleted.ID).Scan(&deletedRaw); err != nil {
		t.Fatal(err)
	}
	var deletedTask Task
	if err = json.Unmarshal([]byte(deletedRaw), &deletedTask); err != nil {
		t.Fatal(err)
	}
	if deletedTask.Description != expected || deletedTask.DeletedAt == nil {
		t.Fatal("deleted task data lost in migration")
	}
	list, _ := s.List(ctx)
	if len(list) != 2 {
		t.Fatal("migration exposed deleted task")
	}
	if list[0].ID != b.ID {
		t.Fatal("migration changed order")
	}
	updated, err := s.Act(ctx, a.ID, Action{Op: "update", Version: got.Version, Description: ptr("")})
	if err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	got, _ = s.Get(ctx, a.ID)
	if got.Description != "" || got.Version != updated.Version {
		t.Fatal("migration recreated a cleared description")
	}
}
func TestSettingsPersistenceValidationAndRetiredOptions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	cfg, _ := s.Settings(ctx)
	cfg.Workflows = append(cfg.Workflows, ConfigWorkflow{Option: Option{ID: "custom", Name: "自訂", Color: "#123456"}, Stages: []Option{{ID: "queued", Name: "排程中", Color: "#abcdef"}, {ID: "active", Name: "進行中", Color: "#557565"}}, DefaultStage: "queued"})
	cfg.Priorities = append(cfg.Priorities, Option{ID: "3", Name: "緊急", Color: "#ff0000"})
	cfg.DefaultType = "custom"
	cfg.DefaultPriority = 3
	cfg, err = s.SaveSettings(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	task, err := s.Create(ctx, CreateInput{Title: "自訂流程", Priority: 3, Description: "自由描述"})
	if err != nil {
		t.Fatal(err)
	}
	if task.Type != "custom" || task.Stage != "queued" {
		t.Fatal("defaults ignored")
	}
	cfg.Workflows[3].Stages[0].Name = "待排程"
	cfg.Workflows[3].Stages[0].Color = "#654321"
	cfg.Workflows[3].Stages[0].Disabled = true
	cfg.Workflows[3].DefaultStage = "active"
	cfg, err = s.SaveSettings(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	task, err = s.Act(ctx, task.ID, Action{Op: "update", Version: task.Version, Description: ptr("仍可編輯")})
	if err != nil {
		t.Fatal(err)
	}
	if task.Stage != "queued" {
		t.Fatal("renaming changed association")
	}
	if _, err = s.Create(ctx, CreateInput{Title: "禁止停用階段", Type: "custom", Stage: "queued", Priority: 3}); !errors.Is(err, ErrInvalid) {
		t.Fatal("retired option accepted")
	}
	if _, err = s.Create(ctx, CreateInput{Title: "禁止未知優先順序", Priority: 99}); !errors.Is(err, ErrInvalid) {
		t.Fatal("unknown priority accepted")
	}
	_, err = s.Act(ctx, task.ID, Action{Op: "update", Version: task.Version, Stage: ptr("missing"), Description: ptr("不可部分寫入")})
	if !errors.Is(err, ErrInvalid) {
		t.Fatal("invalid update accepted")
	}
	got, _ := s.Get(ctx, task.ID)
	if got.Description != "仍可編輯" || got.Version != task.Version {
		t.Fatal("invalid update partially saved")
	}
	stale := cfg
	stale.Version--
	if _, err = s.SaveSettings(ctx, stale); !errors.Is(err, ErrConflict) {
		t.Fatal("stale settings saved")
	}
	// Invalid settings must preserve the previously saved document.
	raw, _ := json.Marshal(cfg)
	for _, mutate := range []func(*Settings){
		func(c *Settings) { c.Priorities[0].Color = "red" },
		func(c *Settings) { c.DefaultType = "missing" },
		func(c *Settings) { c.Priorities[0].ID = c.Priorities[1].ID },
		func(c *Settings) { c.Workflows[3].Stages[0].ID = c.Workflows[3].Stages[1].ID },
		func(c *Settings) { c.Priorities[0].ID = "-1" },
		func(c *Settings) { c.Workflows[3].Stages[1].Disabled = true },
	} {
		var invalid Settings
		json.Unmarshal(raw, &invalid)
		mutate(&invalid)
		if _, err = s.SaveSettings(ctx, invalid); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid settings accepted: %v", err)
		}
		saved, _ := s.Settings(ctx)
		if saved.Version != cfg.Version {
			t.Fatal("failed save changed settings")
		}
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	saved, err := s.Settings(ctx)
	if err != nil || saved.Workflows[3].Stages[0].Name != "待排程" || saved.Priorities[3].ID != "3" {
		t.Fatalf("settings not persistent: %+v %v", saved, err)
	}
}

func TestDeletingOptionsReassignsReferencesAtomically(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	cfg, _ := s.Settings(ctx)
	if len(cfg.ColorPresets) != 16 {
		t.Fatal("missing preset palette")
	}
	cfg.Workflows[2].Stages = append(cfg.Workflows[2].Stages, Option{ID: "custom-stage", Name: "自訂階段", Color: "#F4B8CB"})
	cfg.Priorities = append(cfg.Priorities, Option{ID: "3", Name: "自訂優先順序", Color: "#B5D8F5"})
	cfg, err := s.SaveSettings(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	a, err := s.Create(ctx, CreateInput{Title: "改用預設階段與優先順序", Type: "general", Stage: "custom-stage", Priority: 3, Description: "保持描述"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.Create(ctx, CreateInput{Title: "改用預設類型", Type: "development", Stage: "PR review", Priority: 1})
	if err != nil {
		t.Fatal(err)
	}
	completed, err := s.Act(ctx, b.ID, Action{Op: "complete_task", Version: b.Version})
	if err != nil {
		t.Fatal(err)
	}
	untouched, err := s.Create(ctx, CreateInput{Title: "不受影響", Type: "general", Priority: 1})
	if err != nil {
		t.Fatal(err)
	}
	deleted, err := s.Create(ctx, CreateInput{Title: "保留軟刪除", Type: "communication", Priority: 1})
	if err != nil {
		t.Fatal(err)
	}
	deleted, err = s.Act(ctx, deleted.ID, Action{Op: "delete_item", Version: deleted.Version})
	if err != nil {
		t.Fatal(err)
	}
	cfg.Workflows = cfg.Workflows[2:]
	cfg.Workflows[0].Stages = cfg.Workflows[0].Stages[:3]
	cfg.Priorities = cfg.Priorities[:3]
	cfg, err = s.SaveSettings(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	first, _ := s.Get(ctx, a.ID)
	if first.Stage != cfg.Workflows[0].DefaultStage || first.Priority != cfg.DefaultPriority || first.Description != a.Description || first.Version != a.Version+1 {
		t.Fatalf("reference replacement failed: %+v", first)
	}
	if last := first.History[len(first.History)-1]; last.Action != "replace_deleted_option" || last.Source != "settings" {
		t.Fatal("missing deletion history")
	}
	second, _ := s.Get(ctx, b.ID)
	if second.Type != "general" || second.Stage != cfg.Workflows[0].DefaultStage || second.CompletedAt == nil || !second.CompletedAt.Equal(*completed.CompletedAt) {
		t.Fatal("completed task lost state")
	}
	third, _ := s.Get(ctx, untouched.ID)
	if third.Version != untouched.Version || len(third.History) != len(untouched.History) {
		t.Fatal("unrelated task was changed")
	}
	var raw string
	if err = s.db.QueryRow(`SELECT document FROM tasks WHERE id=?`, deleted.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var archived Task
	json.Unmarshal([]byte(raw), &archived)
	if archived.DeletedAt == nil || archived.Type != "general" || archived.Version != deleted.Version+1 {
		t.Fatal("deleted task references not replaced safely")
	}
	if _, err = s.Act(ctx, a.ID, Action{Op: "update", Version: a.Version, Description: ptr("stale")}); !errors.Is(err, ErrConflict) {
		t.Fatal("old task version accepted after reassignment")
	}
	if _, err = s.Create(ctx, CreateInput{Title: "刪除的階段", Type: "general", Stage: "custom-stage", Priority: 1}); !errors.Is(err, ErrInvalid) {
		t.Fatal("deleted stage accepted")
	}
}

func TestDeletingUsedStageWithoutReplacementRollsBack(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	task, err := s.Create(ctx, CreateInput{Title: "仍需階段", Type: "communication", Priority: 1})
	if err != nil {
		t.Fatal(err)
	}
	cfg, _ := s.Settings(ctx)
	originalVersion := cfg.Version
	cfg.Workflows[1].Disabled = true
	cfg.Workflows[1].Stages = nil
	if _, err = s.SaveSettings(ctx, cfg); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected missing replacement error: %v", err)
	}
	saved, _ := s.Settings(ctx)
	got, _ := s.Get(ctx, task.ID)
	if saved.Version != originalVersion || saved.Workflows[1].Disabled || got.Version != task.Version || got.Stage != task.Stage {
		t.Fatal("failed deletion left partial data")
	}
}
