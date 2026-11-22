package desktop

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"famo/internal/syncclient"
	"famo/internal/tasks"
)

func TestSyncSettingsWritesStartupFileWithoutBinding(t *testing.T) {
	path := filepath.Join(t.TempDir(), "custom.db")
	cfg := Config{DBPath: path, UseDefaultSyncConfig: true}
	wantPath := filepath.Join(filepath.Dir(path), "famo-sync.json")
	if cfg.syncConfigPath() != wantPath {
		t.Fatalf("settings path = %q, want %q", cfg.syncConfigPath(), wantPath)
	}
	store, err := tasks.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	settings := SyncSettings{path: cfg.syncConfigPath(), dbPath: path, store: store}

	state, err := settings.Status()
	if err != nil || state.Config != nil || state.DefaultIntervalSeconds != 30 {
		t.Fatalf("unconfigured state = %+v, %v", state, err)
	}
	if _, err := os.Stat(wantPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("reading settings should leave the file absent: %v", err)
	}

	input := syncclient.Config{URL: "https://SYNC.EXAMPLE.COM/", Account: "personal", IntervalSeconds: 45}
	if err := settings.Save(t.Context(), input); err != nil {
		t.Fatal(err)
	}
	saved, err := syncclient.ReadConfig(wantPath)
	if err != nil || saved.URL != "https://sync.example.com" || saved.Account != "personal" || saved.IntervalSeconds != 45 {
		t.Fatalf("startup configuration = %+v, %v", saved, err)
	}
	info, err := os.Stat(wantPath)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("settings file permissions = %v, %v", info, err)
	}
	var raw map[string]json.RawMessage
	data, err := os.ReadFile(wantPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &raw); err != nil || len(raw) != 3 {
		t.Fatalf("expected only the three sync fields: %v", err)
	}

	status, err := store.SyncStatus(t.Context())
	if err != nil || status.URL != "" || status.Pending != 0 {
		t.Fatalf("save should not start sync or bind the database: %+v, %v", status, err)
	}
	if err := store.BindSync(t.Context(), saved.URL, saved.Account); err != nil {
		t.Fatal(err)
	}

	for _, url := range []string{
		"https://name:sample-password@sync.example.com",
		"https://another.example.com",
	} {
		input.URL = url
		if err := settings.Save(t.Context(), input); err == nil {
			t.Fatal("invalid or mismatched URL was accepted")
		}
		got, err := syncclient.ReadConfig(wantPath)
		if err != nil || got != saved {
			t.Fatalf("rejected save changed the file: %+v, %v", got, err)
		}
	}
}

func TestSyncSettingsRejectsDatabaseAsSettingsFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "famo-sync.json")
	store, err := tasks.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	settings := SyncSettings{path: path, dbPath: path, store: store}
	err = settings.Save(t.Context(), syncclient.Config{URL: "https://sync.example.com", Account: "personal"})
	if err == nil {
		t.Fatal("settings save accepted the SQLite database as a destination")
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) < 16 || string(data[:16]) != "SQLite format 3\x00" {
		t.Fatalf("database was overwritten: %v", err)
	}
}
