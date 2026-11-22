package syncclient

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	DefaultConfigName      = "famo-sync.json"
	DefaultIntervalSeconds = 30
)

type Config struct {
	URL             string `json:"url"`
	Account         string `json:"account"`
	IntervalSeconds int    `json:"interval_seconds,omitempty"`
}

func ReadConfig(path string) (Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return Config{}, err
	}
	defer file.Close()
	var cfg Config
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("read sync configuration: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return Config{}, errors.New("unexpected extra data in sync configuration")
	}
	return cfg, nil
}

// Origin validates the configuration and returns the same normalized URL used by the runner.
func (c Config) Origin() (string, error) {
	endpoint, _, err := c.validate()
	if err != nil {
		return "", err
	}
	return endpoint.String(), nil
}

func (c Config) validate() (*url.URL, time.Duration, error) {
	endpoint, err := url.Parse(c.URL)
	if err != nil || endpoint.Hostname() == "" || endpoint.User != nil ||
		endpoint.RawQuery != "" || endpoint.ForceQuery || endpoint.Fragment != "" ||
		(endpoint.EscapedPath() != "" && endpoint.EscapedPath() != "/") {
		return nil, 0, errors.New("sync URL must be an origin such as https://sync.example.com")
	}
	endpoint.Host = strings.ToLower(endpoint.Host)
	endpoint.Path = ""
	if endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && isLoopback(endpoint.Hostname())) {
		return nil, 0, errors.New("sync URL requires HTTPS or an HTTP loopback IP for local development")
	}
	if c.Account == "" || len(c.Account) > 128 || strings.ContainsFunc(c.Account, func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.')
	}) {
		return nil, 0, errors.New("sync account must use only ASCII letters, digits, hyphens, underscores, or dots")
	}
	if c.IntervalSeconds < 0 || c.IntervalSeconds > 3600 {
		return nil, 0, errors.New("sync interval_seconds must be between 1 and 3600")
	}
	interval := time.Duration(c.IntervalSeconds) * time.Second
	if interval == 0 {
		interval = DefaultIntervalSeconds * time.Second
	}
	return endpoint, interval, nil
}

func isLoopback(host string) bool {
	ip, err := netip.ParseAddr(host)
	return err == nil && ip.IsLoopback()
}
