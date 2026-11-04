package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

func TestLinkTypeMigrationImportsLegacyKindsWithoutLosingLinks(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v4.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	cfg, _ := s.Settings(ctx)
	cfg.DefaultPriority = 2
	cfg, err = s.SaveSettings(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	a := createTest(t, s)
	b := createTest(t, s)
	if err = s.Reorder(ctx, []string{b.ID, a.ID}); err != nil {
		t.Fatal(err)
	}
	legacy := `[{"type":"Team PR","url":"https://example.com/one"},{"type":" Team PR ","url":"https://example.com/two"},{"type":"Slack","url":"https://example.com/thread"}]`
	if _, err = s.db.Exec(`UPDATE tasks SET links=?,document=json_set(document,'$.links',json(?)); UPDATE settings SET document=json_remove(document,'$.link_types','$.default_link_type'); PRAGMA user_version=4;`, legacy, legacy); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	settings, err := s.Settings(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if settings.Version != cfg.Version || settings.DefaultPriority != 2 || settings.DefaultLinkType != "pr" {
		t.Fatal("migration changed existing settings")
	}
	count := 0
	var imported string
	for _, kind := range settings.LinkTypes {
		if kind.Name == "Team PR" {
			count++
			imported = kind.ID
		}
	}
	if count != 1 || imported == "" {
		t.Fatal("legacy kind was lost or duplicated")
	}
	got, err := s.Get(ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Links) != 3 || got.Links[0].TypeID != imported || got.Links[1].TypeID != imported || got.Links[0].URL == got.Links[1].URL || got.Links[0].Type != "Team PR" || got.Version != a.Version || len(got.History) != len(a.History) {
		t.Fatalf("migration lost links or metadata: %+v", got)
	}
	list, _ := s.List(ctx)
	if list[0].ID != b.ID || list[1].ID != a.ID {
		t.Fatal("migration changed manual order")
	}
	var stored string
	if err = s.db.QueryRow(`SELECT links FROM tasks WHERE id=?`, a.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	var links []Link
	json.Unmarshal([]byte(stored), &links)
	if len(links) != 3 || links[0].TypeID != imported {
		t.Fatal("indexed links differ from document")
	}
}

func TestRepeatedLinkKindsRenameRetireAndDelete(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	task, err := s.Create(ctx, CreateInput{Title: "多個 PR", Priority: 1, Links: []Link{{TypeID: "pr", URL: "https://example.com/pr/1"}, {TypeID: "pr", URL: "https://example.com/pr/2"}}})
	if err != nil {
		t.Fatal(err)
	}
	task, err = s.Act(ctx, task.ID, Action{Op: "add_link", Version: task.Version, Links: []Link{{Type: "PR", URL: "https://example.com/pr/3"}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(task.Links) != 3 {
		t.Fatal("same-kind links were replaced")
	}
	cfg, _ := s.Settings(ctx)
	cfg.LinkTypes[0].Name = "Pull Request"
	cfg, err = s.SaveSettings(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	task, _ = s.Get(ctx, task.ID)
	for i, link := range task.Links {
		if link.Type != "Pull Request" || link.TypeID != "pr" {
			t.Fatalf("rename lost association %d: %+v", i, link)
		}
	}
	before := task.Version
	cfg.LinkTypes[0].Disabled = true
	cfg.DefaultLinkType = "slack"
	cfg, err = s.SaveSettings(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	task, err = s.Act(ctx, task.ID, Action{Op: "update", Version: before, Description: ptr("保留已停用種類的連結")})
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range [][]Link{
		{{TypeID: "pr", URL: "https://example.com/pr/4"}},
		{{TypeID: "slack", URL: "https://example.com/good"}, {TypeID: "missing", URL: "https://example.com/bad"}},
		{{TypeID: "slack", URL: "javascript:alert(1)"}},
	} {
		if _, err = s.Act(ctx, task.ID, Action{Op: "add_link", Version: task.Version, Links: input}); !errors.Is(err, ErrInvalid) {
			t.Fatalf("invalid new link accepted: %v", err)
		}
	}
	got, _ := s.Get(ctx, task.ID)
	if got.Version != task.Version || len(got.Links) != 3 {
		t.Fatal("failed add partially wrote links")
	}
	cfg.LinkTypes = cfg.LinkTypes[1:]
	cfg, err = s.SaveSettings(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	got, _ = s.Get(ctx, task.ID)
	if got.Version != task.Version+1 || got.Description != task.Description || len(got.Links) != 3 {
		t.Fatal("delete lost task content or links")
	}
	for i, link := range got.Links {
		if link.TypeID != "slack" || link.Type != "Slack" || link.URL != task.Links[i].URL {
			t.Fatal("delete changed URL or merged links")
		}
	}
	var raw string
	s.db.QueryRow(`SELECT links FROM tasks WHERE id=?`, task.ID).Scan(&raw)
	var indexed []Link
	json.Unmarshal([]byte(raw), &indexed)
	if len(indexed) != 3 || indexed[2].TypeID != "slack" {
		t.Fatal("indexed links not updated")
	}
	invalid := cfg
	invalid.LinkTypes = nil
	invalid.DefaultLinkType = "missing"
	// Omitting the new fields preserves them for old clients; an explicit empty array is invalid.
	invalid.LinkTypes = []Option{}
	if _, err = s.SaveSettings(ctx, invalid); !errors.Is(err, ErrInvalid) {
		t.Fatal("settings without a default link kind accepted")
	}
	saved, _ := s.Settings(ctx)
	if saved.Version != cfg.Version {
		t.Fatal("invalid settings changed data")
	}
}
