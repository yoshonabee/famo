package tasks

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
)

func ptr[T any](v T) *T { return &v }
func openTest(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}
func createTest(t *testing.T, s *Store) Task {
	t.Helper()
	task, err := s.Create(context.Background(), CreateInput{Title: "修復登入", Type: "development", Priority: 2, Goal: "使用者能登入", Context: "Slack 討論中的問題", Acceptance: "測試通過", Steps: []string{"修復並開 PR", "確認 CI"}})
	if err != nil {
		t.Fatal(err)
	}
	return task
}
func TestAgentRoundTripAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "famo.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	task := createTest(t, s)
	updated, err := s.Act(context.Background(), task.ID, Action{Op: "complete_step", Version: task.Version, Source: "agent:codex", StepID: task.Steps[0].ID, NextStep: ptr("查看 CI 結果"), Stage: ptr("PR review"), WaitingReason: ptr("CI 執行中"), ReviewAt: ptr("2026-11-05T09:00:00+08:00"), Links: []Link{{Type: "GitHub PR", URL: "https://github.com/example/repo/pull/1"}}})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != 2 || updated.Steps[0].CompletedAt == nil || updated.Steps[1].Title != "查看 CI 結果" || updated.WaitingSince == nil || updated.ReviewAt == nil || len(updated.Links) != 1 || updated.CompletedAt != nil {
		t.Fatalf("unexpected update: %+v", updated)
	}
	if len(updated.History) != 2 || updated.History[1].Source != "agent:codex" {
		t.Fatal("history missing")
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	restored, err := s.Get(context.Background(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Version != 2 || restored.Goal != task.Goal || restored.Links[0].URL != updated.Links[0].URL {
		t.Fatal("data not persisted")
	}
	resumed, err := s.Act(context.Background(), task.ID, Action{Op: "resume", Version: 2})
	if err != nil {
		t.Fatal(err)
	}
	if resumed.WaitingReason != "" || resumed.WaitingSince != nil || resumed.ReviewAt != nil {
		t.Fatal("resume should clear waiting and review")
	}
}
func TestFailedActionIsAtomic(t *testing.T) {
	s := openTest(t)
	task := createTest(t, s)
	_, err := s.Act(context.Background(), task.ID, Action{Op: "complete_step", Version: 1, StepID: task.Steps[0].ID, WaitingReason: ptr("CI"), Links: []Link{{Type: "PR", URL: "javascript:alert(1)"}}})
	if err == nil {
		t.Fatal("invalid URL accepted")
	}
	got, err := s.Get(context.Background(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != 1 || got.Steps[0].CompletedAt != nil || got.WaitingReason != "" || len(got.History) != 1 {
		t.Fatal("partial write")
	}
	_, err = s.Act(context.Background(), task.ID, Action{Op: "set_waiting", Version: 1, WaitingReason: ptr("CI"), ReviewAt: ptr("tomorrow")})
	if err == nil {
		t.Fatal("invalid date accepted")
	}
}
func TestConcurrentWritersConflict(t *testing.T) {
	s := openTest(t)
	task := createTest(t, s)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, next := range []string{"A", "B"} {
		wg.Go(func() {
			_, err := s.Act(context.Background(), task.ID, Action{Op: "update_next_step", Version: 1, NextStep: &next})
			results <- err
		})
	}
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatalf("success=%d conflicts=%d", success, conflicts)
	}
	got, _ := s.Get(context.Background(), task.ID)
	if got.Version != 2 || len(got.History) != 2 {
		t.Fatal("lost update or duplicated history")
	}
}
func TestStepCompletionDoesNotFinishTask(t *testing.T) {
	s := openTest(t)
	task, err := s.Create(context.Background(), CreateInput{Title: "溝通需求", Type: "communication", Steps: []string{"草擬訊息"}})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := s.Act(context.Background(), task.ID, Action{Op: "complete_step", Version: 1, StepID: task.Steps[0].ID})
	if err != nil {
		t.Fatal(err)
	}
	if updated.CompletedAt != nil {
		t.Fatal("step completed whole task")
	}
	updated, err = s.Act(context.Background(), task.ID, Action{Op: "complete_task", Version: 2})
	if err != nil || updated.CompletedAt == nil {
		t.Fatalf("complete task failed: %v", err)
	}
	if _, err = s.Act(context.Background(), task.ID, Action{Op: "resume", Version: 3}); err == nil {
		t.Fatal("completed task should be immutable")
	}
}

func TestReorderSubsetIsAtomicAndDoesNotChangeContent(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	a := createTest(t, s)
	b := createTest(t, s)
	c := createTest(t, s)
	if err := s.Reorder(ctx, []string{c.ID, a.ID}); err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if list[0].ID != c.ID || list[1].ID != b.ID || list[2].ID != a.ID {
		t.Fatal("subset displaced other tasks")
	}
	for _, task := range list {
		if task.Version != 1 || len(task.History) != 1 {
			t.Fatal("sorting changed task content")
		}
	}
	for _, ids := range [][]string{{a.ID, a.ID}, {a.ID, "missing"}, {a.ID}} {
		if err := s.Reorder(ctx, ids); !errors.Is(err, ErrInvalid) {
			t.Fatalf("expected invalid order, got %v", err)
		}
	}
	list, _ = s.List(ctx)
	if list[0].ID != c.ID || list[1].ID != b.ID || list[2].ID != a.ID {
		t.Fatal("failed reorder partially committed")
	}
	if _, err = s.Act(ctx, a.ID, Action{Op: "update", Version: 1, Goal: ptr("new goal")}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Act(ctx, b.ID, Action{Op: "complete_task", Version: 1}); err != nil {
		t.Fatal(err)
	}
	if err = s.Reorder(ctx, []string{a.ID, b.ID}); !errors.Is(err, ErrInvalid) {
		t.Fatal("completed task sortable")
	}
}

func TestLegacyOrderMigrationAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	a := createTest(t, s)
	b, err := s.Create(ctx, CreateInput{Title: "較低優先", Priority: 0})
	if err != nil {
		t.Fatal(err)
	}
	// Simulate the original schema, which did not have a separate ordering table.
	if _, err = s.db.Exec(`DROP TRIGGER tasks_order_insert; DROP TABLE task_order; ALTER TABLE tasks DROP COLUMN deleted_at; PRAGMA user_version=1;`); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.List(ctx)
	if err != nil || len(list) != 2 || list[0].ID != a.ID {
		t.Fatalf("migration: %v %+v", err, list)
	}
	if err = s.Reorder(ctx, []string{b.ID, a.ID}); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	list, err = s.List(ctx)
	if err != nil || list[0].ID != b.ID || list[1].ID != a.ID || list[1].Goal != a.Goal {
		t.Fatal("reopened order or content changed")
	}
	c, err := s.Create(ctx, CreateInput{Title: "後加入", Priority: 2})
	if err != nil {
		t.Fatal(err)
	}
	list, _ = s.List(ctx)
	if list[2].ID != c.ID {
		t.Fatal("new task should append without resetting manual order")
	}
}

func TestMarkdownRenameDeleteAndReopen(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	task := createTest(t, s)
	renamed, err := s.Act(ctx, task.ID, Action{Op: "rename", Version: 1, StepID: task.Steps[0].ID, Title: ptr("新的小步驟")})
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Title != task.Title || renamed.Steps[0].Title != "新的小步驟" || renamed.Goal != task.Goal {
		t.Fatal("step rename changed task context")
	}
	removed, err := s.Act(ctx, task.ID, Action{Op: "delete_item", Version: 2, StepID: task.Steps[0].ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(removed.Steps) != 1 || removed.Steps[0].ID != task.Steps[1].ID || removed.DeletedAt != nil {
		t.Fatal("step deletion removed parent")
	}
	completed, err := s.Act(ctx, task.ID, Action{Op: "complete_task", Version: 3})
	if err != nil {
		t.Fatal(err)
	}
	renamed, err = s.Act(ctx, task.ID, Action{Op: "rename", Version: completed.Version, Title: ptr("新的任務名稱")})
	if err != nil || renamed.CompletedAt == nil {
		t.Fatalf("completed rename: %v", err)
	}
	reopened, err := s.Act(ctx, task.ID, Action{Op: "reopen_task", Version: renamed.Version, Source: "ui"})
	if err != nil {
		t.Fatal(err)
	}
	if reopened.CompletedAt != nil || reopened.Goal != task.Goal || reopened.Context != task.Context || reopened.Acceptance != task.Acceptance || reopened.Steps[0].ID != task.Steps[1].ID {
		t.Fatal("reopen lost task content")
	}
	stepped, err := s.Act(ctx, task.ID, Action{Op: "complete_step", Version: reopened.Version, StepID: task.Steps[1].ID})
	if err != nil {
		t.Fatal(err)
	}
	undone, err := s.Act(ctx, task.ID, Action{Op: "reopen_step", Version: stepped.Version, StepID: task.Steps[1].ID})
	if err != nil || undone.Steps[0].CompletedAt != nil {
		t.Fatalf("undo step: %v", err)
	}
	if _, err = s.Act(ctx, task.ID, Action{Op: "delete_item", Version: 1}); !errors.Is(err, ErrConflict) {
		t.Fatal("stale deletion accepted")
	}
	deleted, err := s.Act(ctx, task.ID, Action{Op: "delete_item", Version: undone.Version})
	if err != nil || deleted.DeletedAt == nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err = s.Get(ctx, task.ID); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleted task exposed")
	}
	list, _ := s.List(ctx)
	if len(list) != 0 {
		t.Fatal("deleted task listed")
	}
	var document string
	if err = s.db.QueryRow(`SELECT document FROM tasks WHERE id=?`, task.ID).Scan(&document); err != nil {
		t.Fatal("soft delete lost original data")
	}
	if len(document) == 0 || deleted.History[len(deleted.History)-1].Action != "delete_item" {
		t.Fatal("deletion missing audit history")
	}
}

func TestV2MigrationKeepsManualOrder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v2.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	a := createTest(t, s)
	b := createTest(t, s)
	if err = s.Reorder(ctx, []string{b.ID, a.ID}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec(`ALTER TABLE tasks DROP COLUMN deleted_at; PRAGMA user_version=2;`); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	list, err := s.List(ctx)
	if err != nil || list[0].ID != b.ID || list[1].ID != a.ID {
		t.Fatalf("migration changed order: %v", err)
	}
	if _, err = s.Act(ctx, a.ID, Action{Op: "delete_item", Version: 1}); err != nil {
		t.Fatal(err)
	}
	list, err = s.List(ctx)
	if err != nil || len(list) != 1 || list[0].ID != b.ID {
		t.Fatal("migration did not support deletion")
	}
}
