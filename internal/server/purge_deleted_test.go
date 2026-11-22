package server

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"famo/internal/tasks"
)

func TestCleanupDeletedRequiresConfirmation(t *testing.T) {
	store, err := tasks.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	assets := fstest.MapFS{}
	for _, tc := range []struct {
		name    string
		handler http.Handler
		body    string
		status  int
	}{
		{"unconfirmed", New(store, assets), `{}`, http.StatusBadRequest},
		{"web settings", New(store, assets), `{"confirm":true}`, http.StatusOK},
		{"desktop settings", NewEmbedded(store, assets), `{"confirm":true}`, http.StatusOK},
		{"desktop agent", NewDesktopAPI(store, assets), `{"confirm":true}`, http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1/api/tasks/recently-deleted/cleanup", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			res := httptest.NewRecorder()
			tc.handler.ServeHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("status = %d, want %d, body = %s", res.Code, tc.status, res.Body)
			}
			if tc.status == http.StatusOK && strings.TrimSpace(res.Body.String()) != `{"deleted_count":0}` {
				t.Fatalf("unexpected cleanup result: %s", res.Body)
			}
		})
	}
}
