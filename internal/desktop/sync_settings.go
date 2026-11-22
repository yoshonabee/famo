package desktop

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"

	"famo/internal/syncclient"
	"famo/internal/tasks"
)

// SyncSettings lets the desktop UI edit the same file read on startup.
type SyncSettings struct {
	path    string
	dbPath  string
	store   *tasks.Store
	backend *Backend
}

type SyncSettingsState struct {
	Path                   string             `json:"path"`
	Config                 *syncclient.Config `json:"config"`
	DefaultIntervalSeconds int                `json:"default_interval_seconds"`
}

func (s *SyncSettings) RuntimeStatus(ctx context.Context) (syncclient.Status, error) {
	return s.backend.syncStatus(ctx)
}

func (s *SyncSettings) RequestSync() {
	s.backend.syncActivity.RequestSync()
}

func (s *SyncSettings) Status() (SyncSettingsState, error) {
	state := SyncSettingsState{Path: s.path, DefaultIntervalSeconds: syncclient.DefaultIntervalSeconds}
	config, err := syncclient.ReadConfig(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	if err != nil {
		return state, err
	}
	origin, err := config.Origin()
	if err != nil {
		return state, err
	}
	config.URL = origin
	state.Config = &config
	return state, nil
}

func (s *SyncSettings) Save(ctx context.Context, config syncclient.Config) error {
	origin, err := config.Origin()
	if err != nil {
		return err
	}
	if s.path == "" {
		return errors.New("sync configuration path is unavailable")
	}
	if target, err := os.Stat(s.path); err == nil {
		if database, err := os.Stat(s.dbPath); err == nil && os.SameFile(target, database) {
			return errors.New("sync configuration path must be separate from the database")
		}
	}
	if err := s.store.CheckSyncDestination(ctx, origin, config.Account); err != nil {
		return err
	}
	config.URL = origin
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	// CreateTemp uses owner-only permissions. Existing readers see either the
	// previous or the complete new configuration.
	file, err := os.CreateTemp(filepath.Dir(s.path), ".famo-sync-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.Write(append(data, '\n')); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), s.path)
}
