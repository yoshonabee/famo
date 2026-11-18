package agentcli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	"famo/internal/agent"
)

type client struct {
	url        string
	instanceID string
	http       *http.Client
}

type responseError struct {
	Status  int    `json:"status"`
	Message string `json:"error"`
}

func (e *responseError) Error() string { return e.Message }

func connect(ctx context.Context, directURL, infoPath string) (*client, error) {
	if directURL != "" && infoPath != "" {
		return nil, errors.New("choose either --url or --api-info")
	}
	info := agent.APIInfo{URL: directURL}
	if directURL == "" {
		if infoPath == "" {
			var err error
			infoPath, err = agent.DefaultAPIInfoPath()
			if err != nil {
				return nil, err
			}
		}
		data, err := os.ReadFile(infoPath)
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("Famo desktop API is unavailable. Open Famo and enable the Agent API in Settings")
		}
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(data, &info); err != nil || info.Version != 1 || info.InstanceID == "" {
			return nil, fmt.Errorf("invalid Famo API discovery file: %s", infoPath)
		}
	}
	address, err := url.Parse(info.URL)
	if err != nil || address.Scheme != "http" || address.Port() == "" || address.User != nil ||
		(address.Path != "" && address.Path != "/") || address.ForceQuery || address.RawQuery != "" || address.Fragment != "" {
		return nil, errors.New("Famo API URL must be a local HTTP origin with a port")
	}
	if !agent.IsLoopbackHost(address.Hostname()) {
		return nil, errors.New("Famo API URL must use a loopback address")
	}
	// Use a direct local connection. Redirects must never forward task data.
	transport := &http.Transport{DialContext: (&net.Dialer{Timeout: 3 * time.Second}).DialContext}
	c := &client{
		url: "http://" + address.Host, instanceID: info.InstanceID,
		http: &http.Client{
			Transport: transport, Timeout: 10 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
	health, err := call[struct{ Status string }](ctx, c, "/health", nil)
	if err != nil {
		return nil, fmt.Errorf("could not verify the Famo API: %w", err)
	}
	if health.Status != "ok" {
		return nil, errors.New("could not verify the Famo API health response")
	}
	return c, nil
}

func call[T any](ctx context.Context, c *client, path string, body any) (T, error) {
	var result T
	method := http.MethodGet
	var payload []byte
	if body != nil {
		method = http.MethodPost
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			return result, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.url+"/api"+path, bytes.NewReader(payload))
	if err != nil {
		return result, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.instanceID != "" {
		req.Header.Set(agent.InstanceHeader, c.instanceID)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	if c.instanceID != "" && (resp.Header.Get(agent.InstanceHeader) != c.instanceID || resp.StatusCode == http.StatusPreconditionFailed) {
		return result, errors.New("Famo API instance changed. Check that Famo is running, then retry")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var data struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if data.Error == "" {
			data.Error = resp.Status
		}
		return result, &responseError{Status: resp.StatusCode, Message: data.Error}
	}
	err = json.NewDecoder(resp.Body).Decode(&result)
	return result, err
}
