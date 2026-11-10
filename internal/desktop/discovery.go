package desktop

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const InstanceHeader = "X-Famo-Instance-ID"

// APIInfo describes the currently running desktop Agent API, not preferences.
type APIInfo struct {
	Version    int    `json:"version"`
	URL        string `json:"url"`
	PID        int    `json:"pid"`
	InstanceID string `json:"instance_id"`
}

func writeAPIInfo(path string, info APIInfo) error {
	if path == "" {
		return nil
	}
	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".agent-api-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(append(data, '\n')); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	// Readers see the complete previous or new record, never partially written JSON.
	return os.Rename(file.Name(), path)
}

func removeAPIInfo(path, expectedInstance string) error {
	if path == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if expectedInstance != "" {
		var info APIInfo
		if json.Unmarshal(data, &info) != nil || info.InstanceID != expectedInstance {
			return nil // Never remove a newer instance's record.
		}
	}
	err = os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
