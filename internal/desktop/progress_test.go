package desktop

import (
	"context"
	"path/filepath"
	"testing"
	"testing/fstest"
	"time"

	"famo/internal/tasks"
)

func TestTodayProgressFollowsScheduledLocalDateAndEdits(t *testing.T) {
	b, err := Start(Config{DBPath: filepath.Join(t.TempDir(), "tasks.db")}, fstest.MapFS{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { b.Close() })
	ctx := context.Background()
	now := time.Date(2026, 11, 17, 0, 15, 0, 0, time.FixedZone("Taipei", 8*60*60))
	check := func(at time.Time, completed, total int) {
		t.Helper()
		got, err := b.todayProgress(ctx, at, "")
		if err != nil || got.Completed != completed || got.Total != total {
			t.Fatalf("progress at %s: %+v, %v; want %d/%d", at, got, err, completed, total)
		}
	}
	check(now, 0, 0)
	create := func(date string) tasks.Task {
		t.Helper()
		task, err := b.store.Create(ctx, tasks.CreateInput{Title: "task", ScheduledDate: date})
		if err != nil {
			t.Fatal(err)
		}
		return task
	}
	act := func(task tasks.Task, action tasks.Action) tasks.Task {
		t.Helper()
		action.Version = task.Version
		updated, err := b.store.Act(ctx, task.ID, action)
		if err != nil {
			t.Fatal(err)
		}
		return updated
	}
	create("")
	create("2026-11-18")
	act(create("2026-11-16"), tasks.Action{Op: "complete_task"})
	first := create("2026-11-17")
	second := act(create("2026-11-17"), tasks.Action{Op: "complete_task"})
	act(create("2026-11-17"), tasks.Action{Op: "delete_item"})
	check(now, 1, 2)
	// UTC is still yesterday; the supplied local calendar determines today.
	check(now.UTC(), 1, 1)
	check(now.AddDate(0, 0, 1), 0, 1)
	first = act(first, tasks.Action{Op: "complete_task"})
	check(now, 2, 2)
	act(second, tasks.Action{Op: "reopen_task"})
	check(now, 1, 2)
	tomorrow := "2026-11-18"
	act(first, tasks.Action{Op: "update", ScheduledDate: &tomorrow})
	check(now, 0, 1)
	check(now.AddDate(0, 0, 1), 1, 2)
	if err := b.store.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := b.todayProgress(ctx, now, ""); err == nil {
		t.Fatal("unreadable store must report an error, not an empty day")
	}
}

func TestTodayProgressFollowsBoardProjectsAndDeletion(t *testing.T) {
	b, err := Start(Config{DBPath: filepath.Join(t.TempDir(), "tasks.db")}, fstest.MapFS{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { b.Close() })
	ctx := t.Context()
	now := time.Date(2026, 11, 20, 12, 0, 0, 0, time.Local)
	createProject := func(name string) string {
		t.Helper()
		project, err := b.store.CreateProject(ctx, tasks.ProjectInput{Name: name})
		if err != nil {
			t.Fatal(err)
		}
		return project.ID
	}
	work := createProject("工作")
	home := createProject("生活")
	workBoard, err := b.store.CreateBoard(ctx, tasks.BoardInput{Name: "工作", ProjectIDs: []string{work}})
	if err != nil {
		t.Fatal(err)
	}
	emptyBoard, err := b.store.CreateBoard(ctx, tasks.BoardInput{Name: "空白"})
	if err != nil {
		t.Fatal(err)
	}
	for _, projectID := range []string{work, home, ""} {
		task, err := b.store.Create(ctx, tasks.CreateInput{
			Title: "task", ScheduledDate: "2026-11-20", ProjectID: projectID,
		})
		if err != nil {
			t.Fatal(err)
		}
		if projectID == work {
			if _, err := b.store.Act(ctx, task.ID, tasks.Action{Op: "complete_task", Version: task.Version}); err != nil {
				t.Fatal(err)
			}
		}
	}
	check := func(id, name, label string) {
		t.Helper()
		progress, err := b.todayProgress(ctx, now, id)
		if err != nil || progress.BoardName != name || progress.Label() != label {
			t.Fatalf("progress for %q = %q, %s, %v; want %q, %s", id, progress.BoardName, progress.Label(), err, name, label)
		}
	}
	check("", "", "1/3")
	check(workBoard.ID, "工作", "1/1")
	check(emptyBoard.ID, "空白", "0/0")
	updated, err := b.store.UpdateBoard(ctx, workBoard.ID, tasks.BoardInput{Name: "生活", ProjectIDs: []string{home}}, workBoard.Version)
	if err != nil {
		t.Fatal(err)
	}
	check(workBoard.ID, "生活", "0/1")
	if err := b.store.DeleteBoard(ctx, updated.ID, updated.Version); err != nil {
		t.Fatal(err)
	}
	check(workBoard.ID, "", "1/3")
}
