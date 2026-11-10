package desktop

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func readAPIInfo(t *testing.T, path string) APIInfo {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var info APIInfo
	if err := json.Unmarshal(data, &info); err != nil {
		t.Fatalf("invalid discovery file: %s: %v", data, err)
	}
	return info
}

func TestDynamicPortsPublishUsableDiscoveryRecords(t *testing.T) {
	var previousURL string
	for _, name := range []string{"first", "second"} {
		dir := filepath.Join(t.TempDir(), name)
		path := filepath.Join(dir, "Application Support", "agent-api.json")
		b, err := Start(Config{
			DBPath: filepath.Join(dir, "data", "famo.db"), APIAddr: DefaultAPIAddr, APIInfoPath: path,
		}, fstest.MapFS{})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { b.Close() })
		info := readAPIInfo(t, path)
		if info.Version != 1 || info.URL != b.APIURL() || info.PID != os.Getpid() || info.InstanceID == "" {
			t.Fatalf("unexpected discovery record: %+v", info)
		}
		if info.URL == previousURL || strings.HasSuffix(info.URL, ":0") {
			t.Fatalf("dynamic address was not independently allocated: %s", info.URL)
		}
		previousURL = info.URL
		response, err := http.Get(info.URL + "/api/health")
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != 200 || response.Header.Get(InstanceHeader) != info.InstanceID {
			t.Fatalf("discovered endpoint does not match this instance: %d %v", response.StatusCode, response.Header)
		}
		stat, err := os.Stat(path)
		if err != nil || stat.Mode().Perm() != 0600 {
			t.Fatalf("discovery file permissions: %v, %v", stat, err)
		}
		leftovers, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".agent-api-*.json"))
		if err != nil || len(leftovers) != 0 {
			t.Fatalf("temporary discovery files leaked: %v, %v", leftovers, err)
		}
	}
}

func TestDiscoveryRefreshAndShutdownOwnership(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agent-api.json")
	if err := os.WriteFile(path, []byte(`{"url":"http://127.0.0.1:1","instance_id":"stale"}`), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := Start(Config{DBPath: filepath.Join(dir, "first.db"), APIAddr: DefaultAPIAddr, APIInfoPath: path}, fstest.MapFS{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { first.Close() })
	firstInfo := readAPIInfo(t, path)
	if firstInfo.InstanceID == "stale" || firstInfo.URL != first.APIURL() {
		t.Fatalf("stale record was not replaced: %+v", firstInfo)
	}
	second, err := Start(Config{DBPath: filepath.Join(dir, "second.db"), APIAddr: DefaultAPIAddr, APIInfoPath: path}, fstest.MapFS{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { second.Close() })
	secondInfo := readAPIInfo(t, path)
	if firstInfo.InstanceID == secondInfo.InstanceID {
		t.Fatal("instance identity was reused")
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	if current := readAPIInfo(t, path); current != secondInfo {
		t.Fatalf("old shutdown removed or changed the current record: %+v", current)
	}
	if err := second.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("shutdown left discovery information behind: %v", err)
	}
}

func TestDisabledAPIClearsStaleDiscoveryAndKeepsNativeUI(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "agent-api.json")
	if err := os.WriteFile(path, []byte(`{"url":"http://127.0.0.1:1"}`), 0600); err != nil {
		t.Fatal(err)
	}
	b, err := Start(Config{DBPath: filepath.Join(dir, "famo.db"), APIInfoPath: path}, fstest.MapFS{
		"index.html": {Data: []byte("<html>Famo</html>")},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if b.APIURL() != "" {
		t.Fatal("disabled API opened a listener")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("disabled API retained stale discovery information: %v", err)
	}
	w := httptest.NewRecorder()
	b.Handler().ServeHTTP(w, httptest.NewRequest("GET", "wails://localhost/", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Famo") {
		t.Fatalf("native UI requires the Agent API: %d %s", w.Code, w.Body)
	}
}

func TestDiscoveryPublishFailureReleasesListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := listener.Addr().String()
	listener.Close()
	dir := t.TempDir()
	// A directory cannot be replaced by the discovery JSON file.
	if b, err := Start(Config{DBPath: filepath.Join(dir, "famo.db"), APIAddr: addr, APIInfoPath: dir}, fstest.MapFS{}); err == nil {
		b.Close()
		t.Fatal("unpublishable API was started")
	}
	listener, err = net.Listen("tcp", addr)
	if err != nil {
		t.Fatalf("failed discovery publication leaked the listener: %v", err)
	}
	listener.Close()
	leftovers, err := filepath.Glob(filepath.Join(filepath.Dir(dir), ".agent-api-*.json"))
	if err != nil || len(leftovers) != 0 {
		t.Fatalf("failed publication left temporary records: %v, %v", leftovers, err)
	}
}

func TestDiscoveryCannotOverwriteDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "famo.db")
	if b, err := Start(Config{DBPath: path, APIAddr: DefaultAPIAddr, APIInfoPath: path}, fstest.MapFS{}); err == nil {
		b.Close()
		t.Fatal("database path accepted as a discovery file")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("invalid discovery path touched the database: %v", err)
	}
}
