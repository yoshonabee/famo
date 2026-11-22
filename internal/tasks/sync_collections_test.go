package tasks

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func emptyCollections() SyncCollections {
	return SyncCollections{CollectionContent: CollectionContent{
		Projects: []SyncProject{},
		Boards:   []SyncBoard{},
	}}
}

func TestCollectionSyncPersistsRetryAndKeepsLaterChanges(t *testing.T) {
	ctx := t.Context()
	path := filepath.Join(t.TempDir(), "tasks.db")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	bindSyncTest(t, store)
	workspace := t.TempDir()
	project, err := store.CreateProject(ctx, ProjectInput{
		Name: "Work", WorkspaceDir: &workspace,
		WorkspacePrompt: ptr("private prompt"),
	})
	if err != nil {
		t.Fatal(err)
	}
	board, err := store.CreateBoard(ctx, BoardInput{Name: "Today", ProjectIDs: []string{project.ID}})
	if err != nil {
		t.Fatal(err)
	}
	first, changed, err := store.PrepareCollectionSync(ctx, emptyCollections())
	if err != nil || changed || first == nil || first.BaseVersion != 0 || first.Boards[0].ID != board.ID {
		t.Fatalf("initial upload: %+v, %t, %v", first, changed, err)
	}
	raw, err := json.Marshal(first)
	if err != nil || strings.Contains(string(raw), "private") || strings.Contains(string(raw), workspace) || strings.Contains(string(raw), "workspace_dir") {
		t.Fatalf("private Project settings leaked: %s, %v", raw, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	_, err = store.UpdateProject(ctx, project.ID, ProjectInput{Name: "Work, later"}, project.Version)
	if err != nil {
		t.Fatal(err)
	}

	committed := SyncCollections{Version: 1, CollectionContent: first.CollectionContent}
	retry, changed, err := store.PrepareCollectionSync(ctx, committed)
	if err != nil || changed || !reflect.DeepEqual(first, retry) {
		t.Fatalf("retry changed payload: %+v, %t, %v", retry, changed, err)
	}
	if err := store.ConfirmCollectionSync(ctx, *retry, committed); err != nil {
		t.Fatal(err)
	}
	next, changed, err := store.PrepareCollectionSync(ctx, committed)
	if err != nil || changed || next == nil || next.BaseVersion != 1 || next.OperationID == first.OperationID ||
		next.Projects[0].Name != "Work, later" {
		t.Fatalf("lost edit made while pending: %+v, %t, %v", next, changed, err)
	}
}

func TestCollectionSyncAppliesRemoteChangesAndRetainsPrivateFields(t *testing.T) {
	ctx := t.Context()
	store := openTest(t)
	bindSyncTest(t, store)
	project, err := store.CreateProject(ctx, ProjectInput{
		Name: "Work", WorkspacePrompt: ptr("use internal repo"),
	})
	if err != nil {
		t.Fatal(err)
	}
	board, err := store.CreateBoard(ctx, BoardInput{Name: "Today", ProjectIDs: []string{project.ID}})
	if err != nil {
		t.Fatal(err)
	}
	first, _, err := store.PrepareCollectionSync(ctx, emptyCollections())
	if err != nil || first == nil {
		t.Fatalf("initial upload: %+v, %v", first, err)
	}
	if err := store.ConfirmCollectionSync(ctx, *first, SyncCollections{Version: 1, CollectionContent: first.CollectionContent}); err != nil {
		t.Fatal(err)
	}
	remote := SyncCollections{Version: 2, CollectionContent: first.CollectionContent}
	remote.Projects[0].Name = "Focus"
	remote.Projects[0].Position = ptr(0)
	remote.Boards[0].Icon = "star"
	op, changed, err := store.PrepareCollectionSync(ctx, remote)
	if err != nil || !changed || op != nil {
		t.Fatalf("remote application: %+v, %t, %v", op, changed, err)
	}
	projects, err := store.ListProjects(ctx)
	if err != nil || len(projects) != 1 || projects[0].Name != "Focus" ||
		projects[0].Version != project.Version+1 || projects[0].WorkspacePrompt != project.WorkspacePrompt {
		t.Fatalf("unexpected projects after remote edit: %+v, %v", projects, err)
	}
	boards, err := store.ListBoards(ctx)
	if err != nil || len(boards) != 1 || boards[0].Icon != "star" || boards[0].Version != board.Version+1 ||
		len(boards[0].ProjectIDs) != 1 || boards[0].ProjectIDs[0] != project.ID {
		t.Fatalf("unexpected boards after remote edit: %+v, %v", boards, err)
	}
	_, err = store.UpdateProject(ctx, project.ID, ProjectInput{Name: "Stale edit"}, project.Version)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("accepted stale editor version: %v", err)
	}
}

func TestCollectionSyncConcurrentEditsRequireReviewedVersions(t *testing.T) {
	ctx := t.Context()
	store := openTest(t)
	bindSyncTest(t, store)
	base := SyncCollections{
		Version: 1,
		CollectionContent: CollectionContent{
			Projects: []SyncProject{{ID: "work", Name: "Work", Color: "#F0AB42"}},
			Boards:   []SyncBoard{},
		},
	}
	_, changed, err := store.PrepareCollectionSync(ctx, base)
	if err != nil || !changed {
		t.Fatalf("adopt collection on fresh desktop: %t, %v", changed, err)
	}
	local, err := store.UpdateProject(ctx, "work", ProjectInput{Name: "Desktop"}, 1)
	if err != nil {
		t.Fatal(err)
	}
	next := base
	next.Version = 2
	next.Projects[0].Name = "Phone"
	op, changed, err := store.PrepareCollectionSync(ctx, next)
	if err != nil || changed || op != nil {
		t.Fatalf("non-atomic conflict: %+v, %t, %v", op, changed, err)
	}
	status, err := store.SyncStatus(ctx)
	if err != nil || status.Collections == nil || status.Collections.Conflict == nil {
		t.Fatalf("no saved conflict: %+v, %v", status, err)
	}
	conflict := status.Collections.Conflict
	if conflict.Local.Projects[0].Name != "Desktop" || conflict.Remote.Projects[0].Name != "Phone" {
		t.Fatalf("wrong values in conflict: %+v", conflict)
	}
	if _, err := store.UpdateProject(ctx, "work", ProjectInput{Name: "Second desktop edit"}, local.Version); err != nil {
		t.Fatal(err)
	}
	if err := store.ResolveCollectionConflict(ctx, conflict.LocalToken, conflict.Remote.Version, false); err == nil {
		t.Fatal("resolved using a stale local token")
	}
	status, err = store.SyncStatus(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.ResolveCollectionConflict(ctx, status.Collections.Conflict.LocalToken, next.Version, true); err != nil {
		t.Fatal(err)
	}
	op, changed, err = store.PrepareCollectionSync(ctx, next)
	if err != nil || changed || op == nil || op.BaseVersion != next.Version || op.Projects[0].Name != "Second desktop edit" {
		t.Fatalf("did not queue reviewed local version: %+v, %t, %v", op, changed, err)
	}
}

func TestCollectionSyncProjectRemovalDoesNotRequeueTasks(t *testing.T) {
	ctx := t.Context()
	store := openTest(t)
	bindSyncTest(t, store)
	project := SyncProject{ID: "work", Name: "Work", Color: "#129844"}
	base := SyncCollections{
		Version: 1,
		CollectionContent: CollectionContent{
			Projects: []SyncProject{project},
			Boards:   []SyncBoard{{ID: "today", Name: "Today", Icon: "star", ProjectIDs: []string{project.ID}}},
		},
	}
	if _, _, err := store.PrepareCollectionSync(ctx, base); err != nil {
		t.Fatal(err)
	}
	task, err := store.Create(ctx, CreateInput{Title: "Bring the charger", ProjectID: project.ID})
	if err != nil {
		t.Fatal(err)
	}
	first := nextSyncOperation(t, store)
	if _, err := store.AcknowledgeSync(ctx, first); err != nil {
		t.Fatal(err)
	}
	remote := emptyCollections()
	remote.Version = 2
	remote.Boards = []SyncBoard{{ID: "today", Name: "Today", Icon: "star", ProjectIDs: []string{}}}
	op, changed, err := store.PrepareCollectionSync(ctx, remote)
	if err != nil || !changed || op != nil {
		t.Fatalf("remote Project removal: %+v, %t, %v", op, changed, err)
	}
	unassigned, err := store.Get(ctx, task.ID)
	if err != nil || unassigned.ProjectID != "" || unassigned.Version != task.Version+1 {
		t.Fatalf("did not clear a removed Project: %+v, %v", unassigned, err)
	}
	status, err := store.SyncStatus(ctx)
	if err != nil || status.Pending != 0 {
		t.Fatalf("Project removal queued duplicate task edits: %+v, %v", status, err)
	}
	stale := first.Task
	stale.Version++
	stale.Title = "Phone edit during Project removal"
	if _, err := store.ApplySyncChanges(ctx, []SyncChange{{Sequence: 2, Task: stale}}, 2); err != nil {
		t.Fatal(err)
	}
	got, err := store.Get(ctx, task.ID)
	if err != nil || got.Title != stale.Title || got.ProjectID != "" {
		t.Fatalf("later task update reintroduced the Project: %+v, %v", got, err)
	}
}

func TestCollectionSyncConflictingProjectDeletionKeepsTaskAssignments(t *testing.T) {
	ctx := t.Context()
	store := openTest(t)
	bindSyncTest(t, store)

	project := SyncProject{ID: "work", Name: "Work", Color: "#129844"}
	base := emptyCollections()
	base.Version = 1
	base.Projects = []SyncProject{project}
	if _, _, err := store.PrepareCollectionSync(ctx, base); err != nil {
		t.Fatal(err)
	}
	task, err := store.Create(ctx, CreateInput{Title: "Review the changes", ProjectID: project.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcknowledgeSync(ctx, nextSyncOperation(t, store)); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteProject(ctx, project.ID, 1); err != nil {
		t.Fatal(err)
	}

	remote := emptyCollections()
	remote.Version = 2
	remote.Projects = []SyncProject{{ID: project.ID, Name: "Remote Work", Color: project.Color}}
	if _, _, err := store.PrepareCollectionSync(ctx, remote); err != nil {
		t.Fatal(err)
	}
	status, err := store.SyncStatus(ctx)
	if err != nil || status.Pending != 0 || status.Collections.Conflict == nil {
		t.Fatalf("expected a collection conflict and no task edits, got %+v, %v", status, err)
	}
	if err := store.ResolveCollectionConflict(ctx, status.Collections.Conflict.LocalToken, remote.Version, false); err != nil {
		t.Fatal(err)
	}
	retained, err := store.Get(ctx, task.ID)
	if err != nil || retained.ProjectID != project.ID {
		t.Fatalf("expected assignment to the retained Project, got %+v, %v", retained, err)
	}

	if err := store.DeleteProject(ctx, project.ID, 1); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale delete after restoring Project returned %v", err)
	}
	if err := store.DeleteProject(ctx, project.ID, 2); err != nil {
		t.Fatal(err)
	}
	op, _, err := store.PrepareCollectionSync(ctx, remote)
	if err != nil || op == nil {
		t.Fatalf("expected pending collection deletion, got %+v, %v", op, err)
	}
	if err := store.ConfirmCollectionSync(ctx, *op, SyncCollections{Version: 3, CollectionContent: op.CollectionContent}); err != nil {
		t.Fatal(err)
	}
	unassigned, err := store.Get(ctx, task.ID)
	if err != nil || unassigned.ProjectID != "" {
		t.Fatalf("expected confirmed deletion to clear the assignment, got %+v, %v", unassigned, err)
	}
}
