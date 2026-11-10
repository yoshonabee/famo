package desktop

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"famo/internal/tasks"
)

func TestNativeWindowAndAgentSharePersistentStore(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Famo", "famo.db")
	assets := fstest.MapFS{"index.html": {Data: []byte("<html>Famo</html>")}}
	b, err := Start(Config{DBPath: path, APIAddr: "127.0.0.1:0"}, assets)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { b.Close() })
	call := func(method, path, body, contentType string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, "wails://localhost"+path, strings.NewReader(body))
		r.Header.Set("Origin", "wails://localhost")
		r.Header.Set("Content-Type", contentType)
		w := httptest.NewRecorder()
		b.Handler().ServeHTTP(w, r)
		return w
	}
	if res := call("GET", "/", "", ""); res.Code != 200 || !strings.Contains(res.Body.String(), "Famo") {
		t.Fatalf("native assets: %d %s", res.Code, res.Body)
	}
	res := call("POST", "/api/tasks", `{"title":"從桌面新增","scheduled_date":"2026-11-10"}`, "application/json")
	if res.Code != 201 {
		t.Fatalf("native create: %d %s", res.Code, res.Body)
	}
	var task tasks.Task
	if err := json.Unmarshal(res.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}
	response, err := http.Get(b.APIURL() + "/tasks/" + task.ID)
	if err != nil {
		t.Fatal(err)
	}
	var agentTask tasks.Task
	err = json.NewDecoder(response.Body).Decode(&agentTask)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || agentTask.Title != task.Title {
		t.Fatalf("Agent cannot see native task: %+v, %v", agentTask, err)
	}
	response, err = http.Post(b.APIURL()+"/tasks/"+task.ID+"/actions", "application/json", strings.NewReader(`{"op":"complete_task","version":1,"source":"agent:test"}`))
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, response.Body)
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("Agent completion: %d", response.StatusCode)
	}
	res = call("POST", "/api/tasks/"+task.ID+"/actions", `{"op":"rename","title":"過期草稿","version":1}`, "application/json")
	if res.Code != 409 {
		t.Fatalf("native stale draft must conflict: %d %s", res.Code, res.Body)
	}
	if res := call("POST", "/api/tasks", `{"title":"wrong type"}`, "text/plain"); res.Code != 415 {
		t.Fatalf("native API accepted non-JSON: %d", res.Code)
	}
	if res := call("POST", "/api/tasks", `{"title":"unknown field","unknown":true}`, "application/json"); res.Code != 400 {
		t.Fatalf("native API accepted unknown field: %d", res.Code)
	}
	// Native origins are accepted only by the in-process handler, never over TCP.
	r, _ := http.NewRequest("POST", b.APIURL()+"/tasks", strings.NewReader(`{"title":"wrong origin"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "wails://localhost")
	response, err = http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 403 {
		t.Fatalf("network origin guard changed: %d", response.StatusCode)
	}
	addr := strings.TrimPrefix(b.APIURL(), "http://")
	if err := b.Close(); err != nil {
		t.Fatal(err)
	}
	if err := b.Close(); err != nil {
		t.Fatalf("repeated close: %v", err)
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatalf("API port was not released: %v", err)
	}
	listener.Close()
	reopened, err := Start(Config{DBPath: path}, assets)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if reopened.APIURL() != "" {
		t.Fatal("disabled API opened a port")
	}
	w := httptest.NewRecorder()
	reopened.Handler().ServeHTTP(w, httptest.NewRequest("GET", "wails://localhost/api/tasks/"+task.ID, nil))
	var saved tasks.Task
	if err := json.Unmarshal(w.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || saved.Title != task.Title || saved.Version != 2 || saved.CompletedAt == nil {
		t.Fatalf("task did not survive restart: %d %s", w.Code, w.Body)
	}
}

func TestAPIStartupFailuresDoNotCreateDatabase(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	for _, addr := range []string{listener.Addr().String(), "0.0.0.0:0", ":0", "192.0.2.1:0", "invalid"} {
		t.Run(addr, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "famo.db")
			b, err := Start(Config{DBPath: path, APIAddr: addr}, fstest.MapFS{})
			if err == nil {
				b.Close()
				t.Fatal("invalid or occupied API address accepted")
			}
			if _, err := os.Stat(path); !os.IsNotExist(err) {
				t.Fatalf("failed startup touched the database: %v", err)
			}
		})
	}
}

func TestFailedDatabaseOpenReleasesAPIPort(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := listener.Addr().String()
	listener.Close()
	if b, err := Start(Config{DBPath: t.TempDir(), APIAddr: addr}, fstest.MapFS{}); err == nil {
		b.Close()
		t.Fatal("directory accepted as a database")
	}
	listener, err = net.Listen("tcp", addr)
	if err != nil {
		t.Fatalf("failed startup leaked the listener: %v", err)
	}
	listener.Close()
}
