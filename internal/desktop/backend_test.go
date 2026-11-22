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
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"

	"famo/internal/syncclient"
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
	if status, err := b.syncStatus(t.Context()); err != nil || status != syncclient.StatusDisabled {
		t.Fatalf("sync status without configuration = %q, %v", status, err)
	}
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
	response, err = http.Post(b.APIURL()+"/tasks/"+task.ID+"/actions", "application/json", strings.NewReader(`{"op":"complete_task","version":1}`))
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

func TestInvalidDefaultSyncConfigKeepsLocalDesktopAvailable(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "famo-sync.json")
	if err := os.WriteFile(configPath, []byte("invalid config"), 0600); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(dir, "famo.db")
	assets := fstest.MapFS{"index.html": {Data: []byte("<html>Famo</html>")}}
	backend, err := Start(Config{DBPath: dbPath, UseDefaultSyncConfig: true}, assets)
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()
	w := httptest.NewRecorder()
	backend.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "wails://localhost/", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("local desktop returned %d", w.Code)
	}
	status, err := backend.store.SyncStatus(t.Context())
	if err != nil || status.URL != "" {
		t.Fatalf("invalid config tied the database to sync: %+v, %v", status, err)
	}
	if status, err := backend.syncStatus(t.Context()); err != nil || status != syncclient.StatusError {
		t.Fatalf("sync status with invalid configuration = %q, %v", status, err)
	}
	if err := backend.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := Start(Config{DBPath: dbPath, SyncConfigPath: configPath}, assets); err == nil {
		t.Fatal("explicit invalid sync configuration should fail")
	}
}

func TestSyncWakesAfterDesktopAndAgentWrites(t *testing.T) {
	const token = "test-loopback-token"
	t.Setenv("FAMO_SYNC_LOCAL_TOKEN", token)
	pulls := make(chan struct{}, 4)
	pushes := make(chan string, 4)
	syncStatusChanged := make(chan struct{}, 1)
	var rejectPull atomic.Bool
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("X-Famo-Sync-Account", "personal")
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/sync/pull":
			if rejectPull.Load() {
				w.WriteHeader(http.StatusServiceUnavailable)
				return
			}
			io.WriteString(w, `{"changes":[],"cursor":0,"has_more":false}`)
			pulls <- struct{}{}
		case "/api/sync/push":
			var op tasks.SyncOperation
			if err := json.NewDecoder(r.Body).Decode(&op); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if op.Task.Title == "Conflicting write" {
				w.WriteHeader(http.StatusConflict)
				io.WriteString(w, `{"current":null}`)
			} else {
				json.NewEncoder(w).Encode(map[string]any{
					"change": tasks.SyncChange{Sequence: 1, Task: op.Task},
				})
			}
			pushes <- op.Task.Title
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer worker.Close()

	dir := t.TempDir()
	config := filepath.Join(dir, "famo-sync.json")
	raw, err := json.Marshal(map[string]any{
		"url": worker.URL, "account": "personal", "interval_seconds": 3600,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config, raw, 0600); err != nil {
		t.Fatal(err)
	}
	backend, err := Start(Config{
		DBPath: filepath.Join(dir, "famo.db"), APIAddr: DefaultAPIAddr, SyncConfigPath: config,
		onSyncStatusChanged: func() {
			select {
			case syncStatusChanged <- struct{}{}:
			default:
			}
		},
	}, fstest.MapFS{})
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()

	settings := &SyncSettings{backend: backend}
	waitForStatus := func(want syncclient.Status) {
		t.Helper()
		timeout := time.After(5 * time.Second)
		for {
			status, err := settings.RuntimeStatus(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			if status == want {
				return
			}
			select {
			case <-syncStatusChanged:
			case <-timeout:
				t.Fatalf("sync status = %q, want %q", status, want)
			}
		}
	}
	waitForPull := func() {
		t.Helper()
		select {
		case <-pulls:
		case <-time.After(5 * time.Second):
			t.Fatal("timed out waiting for sync")
		}
	}
	expectPush := func(want string) {
		t.Helper()
		select {
		case got := <-pushes:
			if got != want {
				t.Fatalf("pushed %q, want %q", got, want)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("local write did not trigger sync")
		}
		waitForPull()
	}
	waitForPull()
	waitForStatus(syncclient.StatusSynced)

	request := httptest.NewRequest(http.MethodPost, "wails://localhost/api/tasks", strings.NewReader(`{"title":"Desktop write"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	backend.Handler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("embedded task create returned %d: %s", recorder.Code, recorder.Body)
	}
	expectPush("Desktop write")
	waitForStatus(syncclient.StatusSynced)

	response, err := http.Post(backend.APIURL()+"/tasks", "application/json", strings.NewReader(`{"title":"Agent write"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("Agent task create returned %d", response.StatusCode)
	}
	expectPush("Agent write")
	waitForStatus(syncclient.StatusSynced)

	rejectPull.Store(true)
	settings.RequestSync()
	waitForStatus(syncclient.StatusError)

	rejectPull.Store(false)
	response, err = http.Post(backend.APIURL()+"/tasks", "application/json", strings.NewReader(`{"title":"Conflicting write"}`))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("Agent task create returned %d", response.StatusCode)
	}
	expectPush("Conflicting write")
	waitForStatus(syncclient.StatusConflict)
}
