package syncclient

import (
	"encoding/json"
	"errors"
	"net/http"
	"path/filepath"
	"testing"

	"famo/internal/tasks"
)

type taskPush struct {
	path       string
	operations []json.RawMessage
}

func captureTaskPushes(t *testing.T, runner *Runner, push func(taskPush) (*http.Response, error)) {
	t.Helper()
	runner.http.Transport = syncTransport(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case collectionsPath:
			return response(http.StatusNotFound, "", `{}`), nil
		case "/api/sync/pull":
			return response(http.StatusOK, "personal", `{"changes":[],"cursor":0,"has_more":false}`), nil
		case "/api/sync/push":
			var op json.RawMessage
			if err := json.NewDecoder(req.Body).Decode(&op); err != nil {
				t.Fatal(err)
			}
			return push(taskPush{req.URL.Path, []json.RawMessage{op}})
		case "/api/sync/push-batch":
			var body struct {
				Operations []json.RawMessage `json:"operations"`
			}
			if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			return push(taskPush{req.URL.Path, body.Operations})
		default:
			t.Fatalf("unexpected sync request %s %s", req.Method, req.URL.Path)
			return nil, errors.New("unexpected sync request")
		}
	})
}

func decodeTaskPush(t *testing.T, raw json.RawMessage) tasks.SyncOperation {
	t.Helper()
	var op tasks.SyncOperation
	if err := json.Unmarshal(raw, &op); err != nil {
		t.Fatal(err)
	}
	return op
}

func acknowledgeTaskPush(t *testing.T, push taskPush) *http.Response {
	t.Helper()
	changes := make([]tasks.SyncChange, 0, len(push.operations))
	for index, raw := range push.operations {
		op := decodeTaskPush(t, raw)
		changes = append(changes, tasks.SyncChange{Sequence: int64(index + 1), Task: op.Task})
	}
	if push.path == "/api/sync/push-batch" {
		return taskPushResponse(t, http.StatusOK, map[string]any{"changes": changes})
	}
	return taskPushResponse(t, http.StatusOK, map[string]any{"change": changes[0]})
}

func taskPushResponse(t *testing.T, status int, body any) *http.Response {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return response(status, "personal", string(raw))
}

func createPushTask(t *testing.T, store *tasks.Store, title string) tasks.Task {
	t.Helper()
	task, err := store.Create(t.Context(), tasks.CreateInput{Title: title})
	if err != nil {
		t.Fatal(err)
	}
	return task
}

func renamePushTask(t *testing.T, store *tasks.Store, task tasks.Task, title string) tasks.Task {
	t.Helper()
	updated, err := store.Act(t.Context(), task.ID, tasks.Action{Op: "rename", Title: &title, Version: task.Version})
	if err != nil {
		t.Fatal(err)
	}
	return updated
}

func TestPushBatchesDistinctTasksAndCoalescesUnsentEdits(t *testing.T) {
	runner, store := testRunner(t)
	first := createPushTask(t, store, "First draft")
	second := createPushTask(t, store, "Second draft")
	first = renamePushTask(t, store, first, "First revision")
	first = renamePushTask(t, store, first, "Final first task")
	second = renamePushTask(t, store, second, "Final second task")

	var pushes []taskPush
	captureTaskPushes(t, runner, func(push taskPush) (*http.Response, error) {
		pushes = append(pushes, push)
		return acknowledgeTaskPush(t, push), nil
	})
	if err := runner.Sync(t.Context()); err != nil {
		t.Fatal(err)
	}
	if len(pushes) != 1 || pushes[0].path != "/api/sync/push-batch" || len(pushes[0].operations) != 2 {
		t.Fatalf("expected one push batch of two tasks, got %+v", pushes)
	}
	want := map[string]tasks.Task{first.ID: first, second.ID: second}
	for _, raw := range pushes[0].operations {
		op := decodeTaskPush(t, raw)
		if task, ok := want[op.TaskID]; !ok || task.Title != op.Task.Title || op.BaseVersion != 0 || op.Task.Version != 1 {
			t.Fatalf("unexpected coalesced operation %+v", op)
		}
		delete(want, op.TaskID)
	}
	for _, task := range []tasks.Task{first, second} {
		local, err := store.Get(t.Context(), task.ID)
		if err != nil || local.Version != task.Version {
			t.Fatalf("local optimistic version changed: %+v, %v", local, err)
		}
	}
	status, err := store.SyncStatus(t.Context())
	if err != nil || status.Pending != 0 {
		t.Fatalf("batch was not acknowledged: %+v, %v", status, err)
	}
}

func TestPushBatchRetryPreservesSubmittedOperationsAcrossRestart(t *testing.T) {
	t.Setenv("FAMO_SYNC_LOCAL_TOKEN", "local-test-token")
	path := filepath.Join(t.TempDir(), "tasks.db")
	config := Config{URL: "http://127.0.0.1:8789", Account: "personal"}
	store, err := tasks.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	runner, err := New(t.Context(), store, config, nil)
	if err != nil {
		t.Fatal(err)
	}
	first := createPushTask(t, store, "First submitted title")
	second := createPushTask(t, store, "Second submitted title")
	submitted := make(map[string]json.RawMessage)
	lostAck := errors.New("connection ended before acknowledgement")
	captureTaskPushes(t, runner, func(push taskPush) (*http.Response, error) {
		if push.path != "/api/sync/push-batch" || len(push.operations) != 2 {
			t.Fatalf("expected the initial two-task batch, got %+v", push)
		}
		for _, raw := range push.operations {
			submitted[decodeTaskPush(t, raw).TaskID] = raw
		}
		return nil, lostAck
	})
	if err := runner.Sync(t.Context()); !errors.Is(err, lostAck) {
		t.Fatalf("expected a lost response, got %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := tasks.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { reopened.Close() })
	runner, err = New(t.Context(), reopened, config, nil)
	if err != nil {
		t.Fatal(err)
	}
	first = renamePushTask(t, reopened, first, "Locally edited after restart")
	firstSubmitted := decodeTaskPush(t, submitted[first.ID])
	acknowledged := make(map[string]bool)
	var newEdit bool
	captureTaskPushes(t, runner, func(push taskPush) (*http.Response, error) {
		if push.path != "/api/sync/push" || len(push.operations) != 1 {
			t.Fatalf("expected individual retry or follow-up, got %+v", push)
		}
		raw := push.operations[0]
		op := decodeTaskPush(t, raw)
		original := submitted[op.TaskID]
		if len(original) != 0 && string(original) == string(raw) {
			if acknowledged[op.TaskID] {
				t.Fatalf("retried already acknowledged task %q", op.TaskID)
			}
			acknowledged[op.TaskID] = true
		} else if newEdit || !acknowledged[first.ID] || op.TaskID != first.ID ||
			op.OperationID == firstSubmitted.OperationID ||
			op.BaseVersion != 1 || op.Task.Version != 2 || op.Task.Title != first.Title {
			t.Fatalf("retry altered its original payload or lost the new edit: %+v", op)
		} else {
			newEdit = true
		}
		return acknowledgeTaskPush(t, push), nil
	})
	if err := runner.Sync(t.Context()); err != nil {
		t.Fatal(err)
	}
	if !acknowledged[first.ID] || !acknowledged[second.ID] || !newEdit {
		t.Fatalf("retry did not confirm both original operations and the new edit: %v, %t", acknowledged, newEdit)
	}
	status, err := reopened.SyncStatus(t.Context())
	if err != nil || status.Pending != 0 {
		t.Fatalf("retry left pending operations: %+v, %v", status, err)
	}
}

func TestPushBatchConflictFallsBackToIndividualOperations(t *testing.T) {
	runner, store := testRunner(t)
	first := createPushTask(t, store, "Local conflicting title")
	second := createPushTask(t, store, "Unrelated task")
	remote := first
	remote.Title = "Remote conflicting title"
	batchOps := make(map[string]string)
	var accepted bool
	captureTaskPushes(t, runner, func(push taskPush) (*http.Response, error) {
		if push.path == "/api/sync/push-batch" {
			if len(batchOps) != 0 || len(push.operations) != 2 {
				t.Fatalf("unexpected push batch: %+v", push)
			}
			for _, raw := range push.operations {
				batchOps[decodeTaskPush(t, raw).TaskID] = string(raw)
			}
			return taskPushResponse(t, http.StatusConflict, map[string]any{"error": "Version conflict"}), nil
		}
		op := decodeTaskPush(t, push.operations[0])
		if batchOps[op.TaskID] != string(push.operations[0]) {
			t.Fatalf("fallback altered its batch operation: %+v", op)
		}
		if op.TaskID == first.ID {
			return taskPushResponse(t, http.StatusConflict, map[string]any{"current": remote}), nil
		}
		accepted = op.TaskID == second.ID
		return acknowledgeTaskPush(t, push), nil
	})
	if err := runner.Sync(t.Context()); err != nil {
		t.Fatal(err)
	}
	status, err := store.SyncStatus(t.Context())
	if err != nil || !accepted || status.Pending != 1 || len(status.Conflicts) != 1 ||
		status.Conflicts[0].Remote == nil || status.Conflicts[0].Remote.ID != first.ID {
		t.Fatalf("batch conflict did not isolate the affected task: %+v, %v", status, err)
	}
}
