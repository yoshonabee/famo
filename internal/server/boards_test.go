package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"

	"famo/internal/tasks"
)

func TestBoardRoutes(t *testing.T) {
	store, err := tasks.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	project, err := store.CreateProject(t.Context(), tasks.ProjectInput{Name: "Work"})
	if err != nil {
		t.Fatal(err)
	}
	handler := New(store, fstest.MapFS{})
	call := func(method, path, body string, status int) []byte {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Host = "localhost:8787"
		if method == http.MethodPost {
			r.Header.Set("Content-Type", "application/json")
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s returned %d, expected %d: %s", method, path, w.Code, status, w.Body)
		}
		return w.Body.Bytes()
	}
	const path = "/api/boards"
	body := call(http.MethodGet, path, "", http.StatusOK)
	if strings.TrimSpace(string(body)) != "[]" {
		t.Fatalf("empty Board list: %s", body)
	}
	body = call(http.MethodPost, path, fmt.Sprintf(`{"name":"Work","project_ids":[%q]}`, project.ID), http.StatusCreated)
	var first tasks.Board
	if err := json.Unmarshal(body, &first); err != nil {
		t.Fatal(err)
	}
	if first.ID == "" || !reflect.DeepEqual(first.ProjectIDs, []string{project.ID}) {
		t.Fatalf("invalid Board response: %s", body)
	}

	update := fmt.Sprintf(`{"name":"New Work","project_ids":[],"version":%d}`, first.Version)
	body = call(http.MethodPost, path+"/"+first.ID, update, http.StatusOK)
	want := tasks.Board{ID: first.ID, Name: "New Work", ProjectIDs: []string{}, Version: first.Version + 1}
	var updated tasks.Board
	if err := json.Unmarshal(body, &updated); err != nil || !reflect.DeepEqual(updated, want) {
		t.Fatalf("invalid updated Board response: %s, %v", body, err)
	}
	call(http.MethodPost, path+"/"+first.ID, update, http.StatusConflict)
	call(http.MethodPost, path+"/missing", update, http.StatusNotFound)
	call(http.MethodPost, path, `{"name":"Missing Project","project_ids":["missing"]}`, http.StatusBadRequest)

	body = call(http.MethodGet, path, "", http.StatusOK)
	var list []tasks.Board
	if err := json.Unmarshal(body, &list); err != nil || !reflect.DeepEqual(list, []tasks.Board{want}) {
		t.Fatalf("invalid Board list: %s, %v", body, err)
	}

	body = call(http.MethodPost, path, fmt.Sprintf(`{"name":"Remove me","project_ids":[%q]}`, project.ID), http.StatusCreated)
	var removed tasks.Board
	if err := json.Unmarshal(body, &removed); err != nil {
		t.Fatal(err)
	}
	deletion := path + "/" + removed.ID + "/delete"
	call(http.MethodPost, deletion, `{"version":2}`, http.StatusConflict)
	call(http.MethodPost, deletion, `{"version":1}`, http.StatusOK)
	call(http.MethodPost, deletion, `{"version":1}`, http.StatusNotFound)
	projects, err := store.ListProjects(t.Context())
	if err != nil || !reflect.DeepEqual(projects, []tasks.Project{project}) {
		t.Fatalf("deleting Board changed Projects: %+v, %v", projects, err)
	}
	call(http.MethodPost, "/api/projects/"+project.ID+"/delete", `{"version":1}`, http.StatusOK)
}
