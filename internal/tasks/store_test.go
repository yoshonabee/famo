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
	task, err := s.Create(context.Background(), CreateInput{Title: "修復登入", Description: "Slack 討論中的問題"})
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
	updated, err := s.Act(context.Background(), task.ID, Action{Op: "update", Version: task.Version, Description: ptr("CI 執行中"), Links: []Link{{URL: "https://github.com/example/repo/pull/1"}}})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != 2 || updated.Description != "CI 執行中" || len(updated.Links) != 1 || updated.CompletedAt != nil {
		t.Fatalf("unexpected update: %+v", updated)
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
	if restored.Version != 2 || restored.Description != updated.Description || restored.Links[0].URL != updated.Links[0].URL {
		t.Fatal("data not persisted")
	}

}
func TestFailedActionIsAtomic(t *testing.T) {
	s := openTest(t)
	task := createTest(t, s)
	_, err := s.Act(context.Background(), task.ID, Action{Op: "update", Version: 1, Description: ptr("must not persist"), Links: []Link{{URL: "javascript:alert(1)"}}})
	if err == nil {
		t.Fatal("invalid URL accepted")
	}
	got, err := s.Get(context.Background(), task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != 1 || got.Description != task.Description || len(got.Links) != 0 {
		t.Fatal("partial write")
	}

}
func TestConcurrentWritersConflict(t *testing.T) {
	s := openTest(t)
	task := createTest(t, s)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, next := range []string{"A", "B"} {
		wg.Go(func() {
			_, err := s.Act(context.Background(), task.ID, Action{Op: "update", Version: 1, Description: &next})
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
	if got.Version != 2 || (got.Description != "A" && got.Description != "B") {
		t.Fatal("lost update")
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
		if task.Version != 1 || task.Description != a.Description {
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
	if _, err = s.Act(ctx, a.ID, Action{Op: "update", Version: 1, Description: ptr("new notes")}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Act(ctx, b.ID, Action{Op: "complete_task", Version: 1}); err != nil {
		t.Fatal(err)
	}
	if err = s.Reorder(ctx, []string{a.ID, b.ID}); !errors.Is(err, ErrInvalid) {
		t.Fatal("completed task sortable")
	}
}

func TestMarkdownRenameDeleteAndReopen(t *testing.T) {
	s := openTest(t)
	ctx := context.Background()
	task := createTest(t, s)
	completed, err := s.Act(ctx, task.ID, Action{Op: "complete_task", Version: 1})
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := s.Act(ctx, task.ID, Action{Op: "rename", Version: completed.Version, Title: ptr("新的任務名稱")})
	if err != nil || renamed.CompletedAt == nil {
		t.Fatalf("completed rename: %v", err)
	}
	reopened, err := s.Act(ctx, task.ID, Action{Op: "reopen_task", Version: renamed.Version})
	if err != nil || reopened.CompletedAt != nil || reopened.Description != task.Description {
		t.Fatalf("reopen lost task content: %+v %v", reopened, err)
	}
	if _, err = s.Act(ctx, task.ID, Action{Op: "delete_item", Version: 1}); !errors.Is(err, ErrConflict) {
		t.Fatal("stale deletion accepted")
	}
	deleted, err := s.Act(ctx, task.ID, Action{Op: "delete_item", Version: reopened.Version})
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
	if len(document) == 0 || deleted.Description != task.Description {
		t.Fatal("deletion changed the task description")
	}
}

func TestRemoveLinkChecksVersionAndRemovesOnlySelectedEntry(t *testing.T) {
	ctx := context.Background()
	s := openTest(t)
	duplicate := Link{URL: "https://example.com/repeated"}
	other := Link{URL: "https://example.com/other"}
	task, err := s.Create(ctx, CreateInput{
		Title: "Remove link", Links: []Link{duplicate, other, duplicate},
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, index := range []*int{nil, ptr(-1), ptr(3)} {
		if _, err := s.Act(ctx, task.ID, Action{
			Op: "remove_link", Version: task.Version, LinkIndex: index,
		}); !errors.Is(err, ErrInvalid) {
			t.Fatalf("expected invalid index, got %v", err)
		}
	}

	action := Action{Op: "remove_link", Version: task.Version, LinkIndex: ptr(0)}
	updated, err := s.Act(ctx, task.ID, action)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != task.Version+1 || len(updated.Links) != 2 || updated.Links[0] != other || updated.Links[1] != duplicate {
		t.Fatalf("unexpected update: %+v", updated)
	}
	if _, err := s.Act(ctx, task.ID, action); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected conflict on stale index, got %v", err)
	}
	for range 2 {
		action.Version = updated.Version
		updated, err = s.Act(ctx, task.ID, action)
		if err != nil {
			t.Fatal(err)
		}
	}
	persisted, err := s.Get(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if persisted.Links == nil || len(persisted.Links) != 0 {
		t.Fatalf("expected an empty link array, got %#v", persisted.Links)
	}
}
