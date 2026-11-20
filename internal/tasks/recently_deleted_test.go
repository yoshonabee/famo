package tasks

import (
	"encoding/json"
	"errors"
	"slices"
	"testing"
	"time"
)

func TestRecentlyDeletedRetention(t *testing.T) {
	s := openTest(t)
	ctx := t.Context()
	now := time.Date(2026, 11, 20, 12, 0, 0, 500_000_000, time.UTC)
	cutoff := now.Add(-7 * 24 * time.Hour)
	deleteAt := func(at time.Time) Task {
		t.Helper()
		task := createTest(t, s)
		if err := apply(&task, Action{Op: "delete_item"}, at); err != nil {
			t.Fatal(err)
		}
		raw, err := json.Marshal(task)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = s.db.ExecContext(ctx, `UPDATE tasks SET deleted_at=?,version=?,document=? WHERE id=?`, at, task.Version, string(raw), task.ID); err != nil {
			t.Fatal(err)
		}
		return task
	}
	inside := deleteAt(cutoff.Add(time.Nanosecond).In(time.FixedZone("+0800", 8*60*60)))
	atBoundary := deleteAt(cutoff)
	expired := deleteAt(cutoff.Add(-time.Nanosecond))
	recent := deleteAt(now)
	active := createTest(t, s)

	list, err := s.listRecentlyDeletedAt(ctx, now)
	if err != nil || len(list) != 2 || list[0].ID != recent.ID || list[1].ID != inside.ID {
		t.Fatalf("recently deleted list: %+v, %v", list, err)
	}
	for _, task := range []Task{atBoundary, expired, active} {
		if _, err := s.restoreAt(ctx, task.ID, task.Version, now); !errors.Is(err, ErrNotFound) {
			t.Errorf("ineligible task %s restored: %v", task.ID, err)
		}
	}
	if _, err := s.restoreAt(ctx, inside.ID, inside.Version-1, now); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale restore: %v", err)
	}
	restored, err := s.restoreAt(ctx, inside.ID, inside.Version, now)
	if err != nil || restored.DeletedAt != nil || restored.Version != inside.Version+1 || !restored.UpdatedAt.Equal(now) {
		t.Fatalf("restore recent task: %+v, %v", restored, err)
	}
	list, err = s.listRecentlyDeletedAt(ctx, now)
	if err != nil || len(list) != 1 || list[0].ID != recent.ID {
		t.Fatalf("restored task remained in recently deleted: %+v, %v", list, err)
	}
}

func TestRestorePreservesTaskDataAndPosition(t *testing.T) {
	s := openTest(t)
	ctx := t.Context()
	first := createTest(t, s)
	task, err := s.Create(ctx, CreateInput{
		Title:         "Restorable task",
		ScheduledDate: "2026-11-18",
		Description:   "Keep the context",
		Links:         []Link{{URL: "https://example.com"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	last := createTest(t, s)
	completed, err := s.Act(ctx, task.ID, Action{Op: "complete_task", Version: task.Version})
	if err != nil {
		t.Fatal(err)
	}
	deleted, err := s.Act(ctx, task.ID, Action{Op: "delete_item", Version: completed.Version})
	if err != nil {
		t.Fatal(err)
	}

	restored, err := s.Restore(ctx, task.ID, deleted.Version)
	if err != nil || restored.DeletedAt != nil || restored.Version != deleted.Version+1 || restored.CompletedAt == nil ||
		!restored.CompletedAt.Equal(*completed.CompletedAt) || restored.Title != task.Title || restored.Description != task.Description ||
		restored.ScheduledDate != task.ScheduledDate || !restored.CreatedAt.Equal(task.CreatedAt) || !slices.Equal(restored.Links, task.Links) {
		t.Fatalf("restore lost task data: %+v, %v", restored, err)
	}
	if _, err = s.Act(ctx, task.ID, Action{Op: "reopen_task", Version: restored.Version}); err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx)
	if err != nil || len(list) != 3 || list[0].ID != first.ID || list[1].ID != task.ID || list[2].ID != last.ID {
		t.Fatalf("restore lost original sort position: %+v, %v", list, err)
	}
}
