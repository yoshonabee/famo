package agent

import (
	"net"
	"os"
	"path/filepath"
)

const InstanceHeader = "X-Famo-Instance-ID"

type APIInfo struct {
	Version    int    `json:"version"`
	URL        string `json:"url"`
	PID        int    `json:"pid"`
	InstanceID string `json:"instance_id"`
}

type Workspace struct {
	Dir    string `json:"dir"`
	Prompt string `json:"prompt"`
}

func IsLoopbackHost(host string) bool {
	return host == "localhost" || net.ParseIP(host).IsLoopback()
}

func DefaultAPIInfoPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Famo", "agent-api.json"), nil
}
