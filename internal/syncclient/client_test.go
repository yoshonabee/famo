package syncclient

import (
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"famo/internal/tasks"
)

type syncTransport func(*http.Request) (*http.Response, error)

func (transport syncTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func response(status int, account, body string) *http.Response {
	return &http.Response{
		StatusCode: status, Header: http.Header{accountHeader: []string{account}},
		Body: io.NopCloser(strings.NewReader(body)),
	}
}

func testRunner(t *testing.T) (*Runner, *tasks.Store) {
	t.Helper()
	t.Setenv("FAMO_SYNC_LOCAL_TOKEN", "local-test-token")
	store, err := tasks.Open(filepath.Join(t.TempDir(), "famo.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	runner, err := New(t.Context(), store, Config{URL: "http://127.0.0.1:8789", Account: "personal"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return runner, store
}

func TestRetryUsesIdenticalOperationAndChecksAccount(t *testing.T) {
	runner, store := testRunner(t)
	input, err := store.Create(t.Context(), tasks.CreateInput{Title: "Retry this task"})
	if err != nil {
		t.Fatal(err)
	}
	account := "unrelated"
	var submissions []string
	runner.http.Transport = syncTransport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer local-test-token" || r.Header.Get(accountHeader) != "personal" {
			t.Error("expected sync account and test authorization headers")
		}
		if r.URL.Path == collectionsPath {
			return response(http.StatusForbidden, "", `{"error":"Access denied"}`), nil
		}
		if r.Method == http.MethodGet {
			return response(200, account, `{"changes":[],"cursor":0,"has_more":false}`), nil
		}
		data, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, err
		}
		submissions = append(submissions, string(data))
		var op tasks.SyncOperation
		if err := json.Unmarshal(data, &op); err != nil {
			return nil, err
		}
		reply := struct {
			Change tasks.SyncChange `json:"change"`
		}{Change: tasks.SyncChange{Sequence: 1, Task: op.Task}}
		raw, err := json.Marshal(reply)
		if err != nil {
			return nil, err
		}
		return response(200, account, string(raw)), nil
	})
	if err := runner.Sync(t.Context()); err == nil {
		t.Fatal("accepted response from another account")
	}
	account = "personal"
	if err := runner.Sync(t.Context()); err != nil {
		t.Fatal(err)
	}
	if len(submissions) != 2 || submissions[0] != submissions[1] {
		t.Fatalf("operation changed on retry: %+v", submissions)
	}
	status, err := store.SyncStatus(t.Context())
	if err != nil || status.Pending != 0 {
		t.Fatalf("operation was not acknowledged: %+v, %v", status, err)
	}
	task, err := store.Get(t.Context(), input.ID)
	if err != nil || task.Version != input.Version {
		t.Fatalf("acknowledgement altered the local editing version: %+v, %v", task, err)
	}
}

func TestSyncFollowsNoRedirects(t *testing.T) {
	runner, _ := testRunner(t)
	runner.http.Transport = syncTransport(func(req *http.Request) (*http.Response, error) {
		if req.URL.Host != "127.0.0.1:8789" {
			t.Errorf("followed a redirect to %q", req.URL)
		}
		resp := response(http.StatusTemporaryRedirect, "personal", "")
		resp.Header.Set("Location", "https://other.example.com/")
		return resp, nil
	})
	if err := runner.Sync(t.Context()); err == nil || !strings.Contains(err.Error(), "HTTP 307") {
		t.Fatalf("unexpected redirect result: %v", err)
	}
}
