package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

func TestScheduledDateLifecycle(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "calendar.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { s.Close() }()
	task, err := s.Create(ctx, CreateInput{Title: "安排一天", ScheduledDate: "2026-11-03"})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := s.Act(ctx, task.ID, Action{Op: "complete_task", Version: task.Version})
	if err != nil || updated.ScheduledDate != "2026-11-03" || updated.CompletedAt == nil {
		t.Fatalf("completion changed date: %+v, %v", updated, err)
	}
	updated, err = s.Act(ctx, task.ID, Action{Op: "update", Version: updated.Version, ScheduledDate: ptr("2026-11-04")})
	if err != nil || updated.ScheduledDate != "2026-11-04" || updated.CompletedAt == nil {
		t.Fatalf("reschedule completed task: %+v, %v", updated, err)
	}
	// A stale date change must not overwrite a concurrent edit.
	if _, err = s.Act(ctx, task.ID, Action{Op: "update", Version: task.Version, ScheduledDate: ptr("")}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale date: %v", err)
	}
	updated, err = s.Act(ctx, task.ID, Action{Op: "update", Version: updated.Version, Description: ptr("保留日期")})
	if err != nil || updated.ScheduledDate != "2026-11-04" {
		t.Fatalf("omitted date changed: %+v, %v", updated, err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx)
	if err != nil || len(list) != 1 || list[0].ScheduledDate != "2026-11-04" || len(list[0].History) != 4 {
		t.Fatalf("date not persisted: %+v, %v", list, err)
	}
	updated, err = s.Act(ctx, task.ID, Action{Op: "update", Version: updated.Version, ScheduledDate: ptr("")})
	if err != nil || updated.ScheduledDate != "" {
		t.Fatalf("clear date: %+v, %v", updated, err)
	}
	updated, err = s.Act(ctx, task.ID, Action{Op: "reopen_task", Version: updated.Version})
	if err != nil || updated.ScheduledDate != "" || updated.CompletedAt != nil {
		t.Fatalf("reopen: %+v, %v", updated, err)
	}
}

func TestScheduledDateValidationAndAtomicity(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	task, err := s.Create(ctx, CreateInput{Title: "不指定日期"})
	if err != nil || task.ScheduledDate != "" {
		t.Fatalf("optional date: %+v %v", task, err)
	}
	for _, date := range []string{"2026-02-29", "2026-11-31", "2026-1-01", "2026-01-1", "0000-01-01", "2026-11-04T00:00:00Z", " 2026-11-04", "tomorrow"} {
		t.Run(date, func(t *testing.T) {
			if _, err := s.Create(ctx, CreateInput{Title: "bad date", ScheduledDate: date}); !errors.Is(err, ErrInvalid) {
				t.Fatalf("invalid create accepted: %v", err)
			}
			if _, err := s.Act(ctx, task.ID, Action{Op: "update", Version: task.Version, ScheduledDate: &date, Title: ptr("must not persist")}); !errors.Is(err, ErrInvalid) {
				t.Fatalf("invalid update accepted: %v", err)
			}
			got, err := s.Get(ctx, task.ID)
			if err != nil || got.Title != task.Title || got.Version != task.Version || got.ScheduledDate != "" || len(got.History) != 1 {
				t.Fatalf("partial write: %+v, %v", got, err)
			}
		})
	}
	for _, date := range []string{"0001-01-01", "2028-02-29", "9999-12-31"} {
		if _, err := s.Create(ctx, CreateInput{Title: "valid date", ScheduledDate: date}); err != nil {
			t.Fatalf("%s rejected: %v", date, err)
		}
	}
}

func TestLegacyDocumentHasNoScheduledDate(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	task := createTest(t, s)
	// Existing v5 JSON documents have no scheduled_date field and need no schema migration.
	raw, _ := json.Marshal(task)
	var document map[string]any
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	delete(document, "scheduled_date")
	raw, _ = json.Marshal(document)
	if _, err := s.db.Exec(`UPDATE tasks SET document=? WHERE id=?`, string(raw), task.ID); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(ctx, task.ID)
	if err != nil || got.ScheduledDate != "" || got.Version != task.Version {
		t.Fatalf("legacy document: %+v, %v", got, err)
	}
	updated, err := s.Act(ctx, task.ID, Action{Op: "update", Version: got.Version, ScheduledDate: ptr("2026-11-04")})
	if err != nil || updated.ScheduledDate != "2026-11-04" || updated.Goal != task.Goal {
		t.Fatalf("legacy update: %+v, %v", updated, err)
	}
}
