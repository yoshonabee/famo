package tasks

import (
	"errors"
	"reflect"
	"slices"
	"testing"
)

func TestBoardsSaveProjectFiltersAtomically(t *testing.T) {
	store := openTest(t)
	ctx := t.Context()
	work, err := store.CreateProject(ctx, ProjectInput{Name: "Work"})
	if err != nil {
		t.Fatal(err)
	}
	life, err := store.CreateProject(ctx, ProjectInput{Name: "Life"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateBoard(ctx, BoardInput{Name: "Work", ProjectIDs: []string{work.ID, "missing"}}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("created a Board with an unknown Project: %v", err)
	}

	focus, err := store.CreateBoard(ctx, BoardInput{Name: " Work ", ProjectIDs: []string{work.ID, life.ID}})
	wantIDs := []string{work.ID, life.ID}
	slices.Sort(wantIDs)
	if err != nil || focus.Name != "Work" || focus.Version != 1 || !slices.Equal(focus.ProjectIDs, wantIDs) {
		t.Fatalf("create Board: %+v, %v", focus, err)
	}
	lifeBoard, err := store.CreateBoard(ctx, BoardInput{Name: "Life"})
	if err != nil || lifeBoard.ProjectIDs == nil || len(lifeBoard.ProjectIDs) != 0 {
		t.Fatalf("create Board without selected Projects: %+v, %v", lifeBoard, err)
	}
	for _, in := range []BoardInput{
		{Name: "work"},
		{Name: " "},
		{Name: "Duplicate Projects", ProjectIDs: []string{work.ID, work.ID}},
		{Name: "Empty Project ID", ProjectIDs: []string{""}},
	} {
		if _, err := store.CreateBoard(ctx, in); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid Board input %+v: %v", in, err)
		}
	}

	if _, err := store.UpdateBoard(ctx, focus.ID, BoardInput{Name: "Changed", ProjectIDs: []string{work.ID, "missing"}}, focus.Version); !errors.Is(err, ErrInvalid) {
		t.Fatalf("updated a Board with an unknown Project: %v", err)
	}
	list, err := store.ListBoards(ctx)
	if err != nil || !reflect.DeepEqual(list, []Board{lifeBoard, focus}) {
		t.Fatalf("failed update changed stored Boards: %+v, %v", list, err)
	}

	updated, err := store.UpdateBoard(ctx, focus.ID, BoardInput{Name: "Work and life", ProjectIDs: []string{life.ID}}, focus.Version)
	if err != nil || updated.Name != "Work and life" || updated.Version != 2 || !slices.Equal(updated.ProjectIDs, []string{life.ID}) {
		t.Fatalf("update Board: %+v, %v", updated, err)
	}
	if _, err := store.UpdateBoard(ctx, focus.ID, BoardInput{Name: "Stale"}, focus.Version); !errors.Is(err, ErrConflict) {
		t.Fatalf("allowed stale Board update: %v", err)
	}
	if _, err := store.UpdateBoard(ctx, "missing", BoardInput{Name: "Unknown"}, 1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown Board update: %v", err)
	}
	execSQL(t, store.db, "DELETE FROM projects WHERE id=?", life.ID)
	if _, err := store.UpdateBoard(ctx, updated.ID, BoardInput{Name: "Stale"}, updated.Version); !errors.Is(err, ErrConflict) {
		t.Fatalf("allowed stale Board update after Project removal: %v", err)
	}
	updated.ProjectIDs = []string{}
	updated.Version++
	list, err = store.ListBoards(ctx)
	if err != nil || !reflect.DeepEqual(list, []Board{lifeBoard, updated}) {
		t.Fatalf("Project removal changed unrelated data or left stale selections: %+v, %v", list, err)
	}
}
