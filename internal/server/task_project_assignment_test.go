package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"testing"
	"testing/fstest"

	"famo/internal/tasks"
)

func TestAssignProjectAPI(t *testing.T) {
	store, err := tasks.Open(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	ctx := t.Context()
	project, err := store.CreateProject(ctx, tasks.ProjectInput{Name: "工作"})
	if err != nil {
		t.Fatal(err)
	}
	createTask := func(input tasks.CreateInput) tasks.Task {
		t.Helper()
		task, err := store.Create(ctx, input)
		if err != nil {
			t.Fatal(err)
		}
		return task
	}
	first := createTask(tasks.CreateInput{
		Title: "第一件", ScheduledDate: "2026-11-20", Description: "保留備註",
		Links: []tasks.Link{{URL: "https://example.com"}},
	})
	second := createTask(tasks.CreateInput{Title: "第二件"})
	deleted := createTask(tasks.CreateInput{Title: "已刪除"})
	second, err = store.Act(ctx, second.ID, tasks.Action{Op: "complete_task", Version: second.Version})
	if err != nil {
		t.Fatal(err)
	}
	deleted, err = store.Act(ctx, deleted.ID, tasks.Action{Op: "delete_item", Version: deleted.Version})
	if err != nil {
		t.Fatal(err)
	}

	handler := New(store, fstest.MapFS{})
	assign := func(t *testing.T, projectID *string, items []tasks.TaskVersion, status int) *httptest.ResponseRecorder {
		t.Helper()
		body, err := json.Marshal(map[string]any{"project_id": projectID, "tasks": items})
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/api/tasks/assign-project", bytes.NewReader(body))
		req.Host = "127.0.0.1:8787"
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != status {
			t.Fatalf("assign: got %d, want %d: %s", rec.Code, status, rec.Body)
		}
		return rec
	}

	firstVersion := tasks.TaskVersion{ID: first.ID, Version: first.Version}
	for _, tc := range []struct {
		name      string
		projectID *string
		items     []tasks.TaskVersion
		status    int
	}{
		{"stale second task", &project.ID, []tasks.TaskVersion{firstVersion, {ID: second.ID, Version: second.Version - 1}}, 409},
		{"deleted second task", &project.ID, []tasks.TaskVersion{firstVersion, {ID: deleted.ID, Version: deleted.Version}}, 404},
		{"missing project", new("missing"), []tasks.TaskVersion{firstVersion}, 400},
		{"duplicate task", &project.ID, []tasks.TaskVersion{firstVersion, firstVersion}, 400},
		{"no tasks", &project.ID, nil, 400},
		{"no project ID", nil, []tasks.TaskVersion{firstVersion}, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assign(t, tc.projectID, tc.items, tc.status)
			saved, err := store.Get(ctx, first.ID)
			if err != nil || !reflect.DeepEqual(saved, first) {
				t.Fatalf("failed batch changed first task: %#v, %v", saved, err)
			}
		})
	}

	var updated []tasks.Task
	success := assign(t, &project.ID, []tasks.TaskVersion{
		{ID: second.ID, Version: second.Version}, firstVersion,
	}, http.StatusOK)
	if err := json.Unmarshal(success.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if len(updated) != 2 {
		t.Fatalf("expected two updated tasks, got %d", len(updated))
	}
	for i, original := range []tasks.Task{second, first} {
		expected := original
		expected.ProjectID = project.ID
		expected.Version++
		expected.UpdatedAt = updated[i].UpdatedAt
		if !reflect.DeepEqual(updated[i], expected) || !updated[i].UpdatedAt.After(original.UpdatedAt) {
			t.Fatalf("incorrect assignment: %#v, want %#v", updated[i], expected)
		}
	}

	cleared := assign(t, new(""), []tasks.TaskVersion{
		{ID: first.ID, Version: updated[1].Version},
		{ID: second.ID, Version: updated[0].Version},
	}, http.StatusOK)
	if bytes.Contains(cleared.Body.Bytes(), []byte(`"project_id"`)) {
		t.Fatalf("clear assignment retained project_id: %s", cleared.Body)
	}
}
