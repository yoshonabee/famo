package server

import (
	"bytes"
	"encoding/json"
	"famo/internal/tasks"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func TestAPIWorkflow(t *testing.T) {
	store, err := tasks.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	h := New(store, fstest.MapFS{"index.html": {Data: []byte("<html>Famo</html>")}})
	call := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Host = "127.0.0.1:8787"
		if method == "POST" {
			r.Header.Set("Content-Type", "application/json")
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	res := call("GET", "/api/tasks", "")
	if res.Code != 200 || strings.TrimSpace(res.Body.String()) != "[]" {
		t.Fatalf("list: %d %s", res.Code, res.Body)
	}
	res = call("POST", "/api/tasks", `{"title":"修復問題","steps":["開 PR"]}`)
	if res.Code != 201 {
		t.Fatalf("create: %d %s", res.Code, res.Body)
	}
	var task tasks.Task
	if err = json.Unmarshal(res.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}
	res = call("GET", "/tasks/"+task.ID+"/context", "")
	if res.Code != 200 {
		t.Fatal("context unavailable")
	}
	body, _ := json.Marshal(map[string]any{"op": "complete_step", "version": 1, "step_id": task.Steps[0].ID, "source": "agent", "waiting_reason": "CI", "links": []tasks.Link{{Type: "PR", URL: "https://github.com/example/repo/pull/1"}}})
	res = call("POST", "/tasks/"+task.ID+"/actions", string(body))
	if res.Code != 200 {
		t.Fatalf("action: %s", res.Body)
	}
	res = call("POST", "/tasks/"+task.ID+"/actions", string(body))
	if res.Code != 409 {
		t.Fatalf("stale update: %d", res.Code)
	}
	for _, body := range []string{`{"title":"bad","unknown":true}`, `{"title":"bad"} {}`, `{`, strings.Repeat("x", (1<<20)+1)} {
		if r := call("POST", "/tasks", body); r.Code != 400 {
			t.Fatalf("invalid payload accepted: %d", r.Code)
		}
	}
	if r := call("GET", "/api/tasks/missing", ""); r.Code != 404 {
		t.Fatal("missing task not 404")
	}
	if r := call("GET", "/api/typo", ""); r.Code != 404 {
		t.Fatal("API typo should not return HTML")
	}
	if r := call("GET", "/", ""); !bytes.Contains(r.Body.Bytes(), []byte("Famo")) {
		t.Fatal("UI not served")
	}
}
func TestLocalAccessGuards(t *testing.T) {
	store, err := tasks.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	h := New(store, fstest.MapFS{})
	for _, tc := range []struct {
		host, origin, content string
		status                int
	}{
		{"evil.example", "", "application/json", 403},
		{"localhost:8787", "https://evil.example", "application/json", 403},
		{"localhost:8787", "http://localhost:8787", "text/plain", 415},
		{"localhost:8787", "http://localhost:5173", "application/json", 201},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/tasks", strings.NewReader(`{"title":"test"}`))
		r.Host = tc.host
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Content-Type", tc.content)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Errorf("%+v: got %d", tc, w.Code)
		}
	}
}
