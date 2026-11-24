package tasks

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func bindSyncTest(t *testing.T, store *Store) {
	t.Helper()
	if err := store.BindSync(t.Context(), "https://sync.example.com", "personal"); err != nil {
		t.Fatal(err)
	}
}

func nextSyncOperation(t *testing.T, store *Store) SyncOperation {
	t.Helper()
	ops, err := store.SyncOperations(t.Context(), 1)
	if err != nil || len(ops) != 1 {
		t.Fatalf("outbox: %+v, %v", ops, err)
	}
	return ops[0]
}

func TestSyncOutboxPersistsWithIndependentVersions(t *testing.T) {
	ctx := t.Context()
	path := filepath.Join(t.TempDir(), "tasks.db")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	task := createTest(t, store)
	task, err = store.Act(ctx, task.ID, Action{Op: "rename", Title: ptr("Local draft"), Version: task.Version})
	if err != nil {
		t.Fatal(err)
	}
	bindSyncTest(t, store)
	first := nextSyncOperation(t, store)
	if first.BaseVersion != 0 || first.Task.Version != 1 || first.Task.Title != task.Title {
		t.Fatalf("backfill: %+v", first)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.BindSync(ctx, "https://sync.example.com", "someone-else"); err == nil {
		t.Fatal("accepted account change for existing database")
	}
	bindSyncTest(t, store)
	retry := nextSyncOperation(t, store)
	if retry.OperationID != first.OperationID || retry.BaseVersion != first.BaseVersion {
		t.Fatalf("did not retry the original operation: %+v", retry)
	}
	if _, err := store.Act(ctx, task.ID, Action{Op: "complete_task", Version: task.Version}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcknowledgeSync(ctx, first); err != nil {
		t.Fatal(err)
	}
	next := nextSyncOperation(t, store)
	if next.BaseVersion != 1 || next.Task.Version != 2 || next.Task.CompletedAt == nil {
		t.Fatalf("next operation: %+v", next)
	}
	local, err := store.Get(ctx, task.ID)
	if err != nil || local.Version != 3 {
		t.Fatalf("local optimistic version: %+v, %v", local, err)
	}
}

func TestSyncPullRetainsRemoteChangesWhileAcknowledgementIsPending(t *testing.T) {
	store := openTest(t)
	ctx := t.Context()
	bindSyncTest(t, store)
	local := createTest(t, store)
	first := nextSyncOperation(t, store)

	remote := local
	remote.Title = "Renamed on phone"
	remote.Version = 2
	changed, err := store.ApplySyncChanges(ctx, []SyncChange{{Sequence: 1, Task: first.Task}, {Sequence: 2, Task: remote}}, 2)
	if err != nil || changed {
		t.Fatalf("applied remote before acknowledgement: %t, %v", changed, err)
	}
	changed, err = store.AcknowledgeSync(ctx, first)
	if err != nil || !changed {
		t.Fatalf("did not apply deferred remote change: %t, %v", changed, err)
	}
	got, err := store.Get(ctx, local.ID)
	if err != nil || got.Title != remote.Title || got.Version != remote.Version {
		t.Fatalf("local task: %+v, %v", got, err)
	}
	status, err := store.SyncStatus(ctx)
	if err != nil || status.Pending != 0 || status.Cursor != 2 {
		t.Fatalf("sync status: %+v, %v", status, err)
	}
}

func TestSyncConflictAndTombstoneFromSharedFixture(t *testing.T) {
	var fixture struct {
		Changes  []SyncChange  `json:"changes"`
		Conflict SyncOperation `json:"conflict"`
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "sync", "protocol-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	store := openTest(t)
	ctx := t.Context()
	bindSyncTest(t, store)
	id := fixture.Conflict.TaskID
	if _, err := store.ApplySyncChanges(ctx, fixture.Changes[:1], 1); err != nil {
		t.Fatal(err)
	}
	local, err := store.Act(ctx, id, Action{
		Op: "rename", Title: &fixture.Conflict.Task.Title, Version: fixture.Conflict.BaseVersion,
	})
	if err != nil {
		t.Fatal(err)
	}
	op := nextSyncOperation(t, store)
	if op.Task.Title != fixture.Conflict.Task.Title || op.BaseVersion != fixture.Conflict.BaseVersion {
		t.Fatalf("conflicting draft: %+v", op)
	}
	// Observe the phone's completion and deletion before the conflict result
	// arrives. Its older completion snapshot must not replace the deletion.
	if _, err := store.ApplySyncChanges(ctx, fixture.Changes[1:], 3); err != nil {
		t.Fatal(err)
	}
	if err := store.RecordSyncConflict(ctx, op, &fixture.Changes[1].Task); err != nil {
		t.Fatal(err)
	}
	status, err := store.SyncStatus(ctx)
	if err != nil || status.Cursor != 3 || status.Pending != 1 || len(status.Conflicts) != 1 {
		t.Fatalf("conflict status: %+v, %v", status, err)
	}
	conflict := status.Conflicts[0]
	if conflict.Local.Title != local.Title || conflict.Remote.DeletedAt == nil || conflict.Remote.ProjectID != local.ProjectID {
		t.Fatalf("conflict snapshots: %+v", conflict)
	}
	if err := store.ResolveSyncConflict(ctx, id, local.Version, 2, false); err == nil {
		t.Fatal("stale conflict resolution succeeded")
	}
	if err := store.ResolveSyncConflict(ctx, id, local.Version, 3, false); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, id); !errors.Is(err, ErrNotFound) {
		t.Fatalf("remote tombstone should hide task: %v", err)
	}
	status, err = store.SyncStatus(ctx)
	if err != nil || status.Pending != 0 || len(status.Conflicts) != 0 {
		t.Fatalf("remote resolution should not echo: %+v, %v", status, err)
	}
}

func TestSyncRejectedDraftCanBeRepairedWithoutBlockingAnotherTask(t *testing.T) {
	store := openTest(t)
	ctx := t.Context()
	bindSyncTest(t, store)
	local := createTest(t, store)
	reject := nextSyncOperation(t, store)
	unrelated := createTest(t, store)
	if err := store.RecordSyncRejection(ctx, reject, 413); err != nil {
		t.Fatal(err)
	}
	if next := nextSyncOperation(t, store); next.TaskID != unrelated.ID {
		t.Fatalf("rejected task blocked the queue: %+v", next)
	}
	status, err := store.SyncStatus(ctx)
	if err != nil || len(status.Rejections) != 1 || status.Rejections[0].TaskID != local.ID {
		t.Fatalf("rejection status: %+v, %v", status, err)
	}
	updated, err := store.Act(ctx, local.ID, Action{Op: "rename", Title: ptr("Repaired"), Version: local.Version})
	if err != nil {
		t.Fatal(err)
	}
	ops, err := store.SyncOperations(ctx, 2)
	if err != nil || len(ops) != 2 {
		t.Fatalf("repaired outbox: %+v, %v", ops, err)
	}
	repaired := ops[1]
	if repaired.TaskID != local.ID || repaired.OperationID == reject.OperationID ||
		repaired.BaseVersion != reject.BaseVersion || repaired.Task.Title != updated.Title {
		t.Fatalf("repaired operation: %+v", repaired)
	}
}

func TestSyncOutboxMigrationPreservesLegacyHeadAndCoalescesTail(t *testing.T) {
	ctx := t.Context()
	path := filepath.Join(t.TempDir(), "tasks.db")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	bindSyncTest(t, store)
	task := createTest(t, store)
	if _, err := store.db.ExecContext(ctx, `
		DROP TRIGGER tasks_sync_insert;
		DROP TRIGGER tasks_sync_update;
		ALTER TABLE sync_outbox DROP COLUMN attempted;
		DELETE FROM sync_outbox;
		PRAGMA user_version=7
	`); err != nil {
		t.Fatal(err)
	}
	for i, opID := range []string{"legacy-head", "legacy-tail-first", "legacy-tail-last"} {
		task.Title = opID
		raw, err := json.Marshal(task)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.db.ExecContext(ctx, `
			INSERT INTO sync_outbox(operation_id,task_id,base_version,document)
			VALUES(?,?,?,?)`, opID, task.ID, i, string(raw)); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	head := nextSyncOperation(t, store)
	if !head.PreviouslyAttempted || head.OperationID != "legacy-head" || head.Task.Title != "legacy-head" || head.BaseVersion != 0 {
		t.Fatalf("migration changed the operation eligible for earlier upload: %+v", head)
	}
	if _, err := store.AcknowledgeSync(ctx, head); err != nil {
		t.Fatal(err)
	}
	tail := nextSyncOperation(t, store)
	if tail.PreviouslyAttempted || tail.OperationID != "legacy-tail-first" || tail.Task.Title != "legacy-tail-last" || tail.BaseVersion != 1 {
		t.Fatalf("migration did not retain the earliest base and latest unsent snapshot: %+v", tail)
	}
	if _, err := store.AcknowledgeSync(ctx, tail); err != nil {
		t.Fatal(err)
	}
	status, err := store.SyncStatus(ctx)
	if err != nil || status.Pending != 0 {
		t.Fatalf("unexpected migrated tail after acknowledging both operations: %+v, %v", status, err)
	}
}
