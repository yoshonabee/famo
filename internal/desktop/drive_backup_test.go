package desktop

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"famo/internal/tasks"
	"golang.org/x/oauth2"
)

func TestReadDriveCredentials(t *testing.T) {
	path := filepath.Join(t.TempDir(), "google.json")
	if err := os.WriteFile(path, []byte(`{"installed":{"client_id":"desktop.apps.googleusercontent.com","client_secret":"test-secret","token_uri":"https://example.invalid/token"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	credentials, err := readDriveCredentials(path)
	if err != nil || credentials.ClientID != "desktop.apps.googleusercontent.com" || credentials.ClientSecret != "test-secret" {
		t.Fatalf("reading desktop OAuth file: %v", err)
	}
	if config := googleDriveClient().oauthConfig(credentials); config.Endpoint.TokenURL != "https://oauth2.googleapis.com/token" {
		t.Fatalf("unexpected token endpoint: %s", config.Endpoint.TokenURL)
	}
	if err := os.WriteFile(path, []byte(`{"web":{"client_id":"web.apps.googleusercontent.com"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := readDriveCredentials(path); err == nil {
		t.Fatal("accepted a web OAuth client")
	}
}

func TestDriveAuthorizationChecksStateAndPKCE(t *testing.T) {
	verifier := make(chan string, 1)
	tokens := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		if r.Method != http.MethodPost || r.FormValue("grant_type") != "authorization_code" || r.FormValue("code") != "temporary-code" ||
			r.FormValue("client_id") != "desktop.apps.googleusercontent.com" || r.FormValue("client_secret") != "test-secret" {
			t.Error("unexpected OAuth exchange request")
		}
		verifier <- r.FormValue("code_verifier")
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"access_token":"test-access","token_type":"Bearer","refresh_token":"test-refresh"}`)
	}))
	defer tokens.Close()
	client := googleDriveClient()
	client.endpoint.TokenURL = tokens.URL
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	var challenge string
	credentials, err := client.authorize(ctx, driveCredentials{
		ClientID: "desktop.apps.googleusercontent.com", ClientSecret: "test-secret",
	}, func(address string) error {
		authURL, err := url.Parse(address)
		if err != nil {
			t.Fatal(err)
		}
		query := authURL.Query()
		challenge = query.Get("code_challenge")
		if query.Get("code_challenge_method") != "S256" || query.Get("scope") != driveScope || query.Get("access_type") != "offline" {
			t.Fatal("authorization request is missing the expected scope, access type, or S256 code challenge")
		}
		callback, err := url.Parse(query.Get("redirect_uri"))
		if err != nil || callback.Scheme != "http" || callback.Hostname() != "127.0.0.1" {
			t.Fatal("callback must use the loopback IP")
		}
		for _, state := range []string{"wrong-state", query.Get("state")} {
			callback.RawQuery = url.Values{"state": {state}, "code": {"temporary-code"}}.Encode()
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, callback.String(), nil)
			if err != nil {
				return err
			}
			resp, err := client.http.Do(req)
			if err != nil {
				return err
			}
			resp.Body.Close()
			want := http.StatusOK
			if state == "wrong-state" {
				want = http.StatusBadRequest
			}
			if resp.StatusCode != want {
				t.Fatalf("callback HTTP status %d, want %d", resp.StatusCode, want)
			}
		}
		return nil
	})
	if err != nil || credentials.RefreshToken != "test-refresh" {
		t.Fatalf("authorizing Drive: %v", err)
	}
	hash := sha256.Sum256([]byte(<-verifier))
	if challenge == "" || base64.RawURLEncoding.EncodeToString(hash[:]) != challenge {
		t.Fatal("the exchanged PKCE verifier does not match the challenge")
	}
}

func TestDriveAuthorizationCancellation(t *testing.T) {
	client := googleDriveClient()
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	_, err := client.authorize(ctx, driveCredentials{}, func(string) error {
		cancel()
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "已取消") {
		t.Fatalf("cancelling authorization: %v", err)
	}
}

func TestDriveBackupUploadsSQLiteSnapshot(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "live.db")
	live, err := tasks.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer live.Close()
	task, err := live.Create(t.Context(), tasks.CreateInput{Title: "Committed to WAL", Description: "Backup me"})
	if err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(dbPath + "-wal"); err != nil || info.Size() == 0 {
		t.Fatalf("expected committed WAL data: %v", err)
	}

	uploaded := filepath.Join(t.TempDir(), "uploaded.db")
	type uploadMetadata struct {
		Name     string `json:"name"`
		MIMEType string `json:"mimeType"`
	}
	type uploadDetails struct {
		metadata uploadMetadata
		size     int64
	}
	initiation := make(chan uploadDetails, 1)
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/token":
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			if r.FormValue("grant_type") != "refresh_token" || r.FormValue("refresh_token") != "test-refresh" {
				t.Error("unexpected OAuth refresh request")
			}
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, `{"access_token":"test-access","token_type":"Bearer","expires_in":3600}`)
		case r.Method == http.MethodPost && r.URL.Path == "/upload" && r.URL.Query().Get("uploadType") == "resumable":
			if r.Header.Get("Authorization") != "Bearer test-access" || r.Header.Get("X-Upload-Content-Type") != driveMIME {
				t.Error("upload initiation is missing required headers")
			}
			var metadata uploadMetadata
			if err := json.NewDecoder(r.Body).Decode(&metadata); err != nil || !strings.HasSuffix(metadata.Name, "Z.db") || metadata.MIMEType != driveMIME {
				t.Errorf("invalid upload metadata: %+v, %v", metadata, err)
			}
			size, err := strconv.ParseInt(r.Header.Get("X-Upload-Content-Length"), 10, 64)
			if err != nil || size <= 0 {
				t.Errorf("invalid upload size: %d, %v", size, err)
			}
			initiation <- uploadDetails{metadata: metadata, size: size}
			w.Header().Set("Location", "http://"+r.Host+"/upload?upload_id=test-session")
			w.WriteHeader(http.StatusOK)
		case r.Method == http.MethodPut && r.URL.Path == "/upload" && r.URL.Query().Get("upload_id") == "test-session":
			data, err := io.ReadAll(r.Body)
			if err != nil {
				t.Error(err)
			}
			if r.Header.Get("Authorization") != "Bearer test-access" || r.Header.Get("Content-Type") != driveMIME ||
				r.ContentLength != int64(len(data)) {
				t.Error("snapshot upload is missing required headers")
			}
			if err := os.WriteFile(uploaded, data, 0600); err != nil {
				t.Error(err)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			io.WriteString(w, `{"id":"test-backup"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer mock.Close()
	client := googleDriveClient()
	client.endpoint.TokenURL = mock.URL + "/token"
	client.uploadURL = mock.URL + "/upload"
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	token, err := client.refresh(ctx, driveCredentials{RefreshToken: "test-refresh"})
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.backup(ctx, token, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	sent := <-initiation
	if result.URL != "https://drive.google.com/open?id=test-backup" || result.Name != sent.metadata.Name {
		t.Fatalf("unexpected upload result: %+v", result)
	}
	if info, err := os.Stat(uploaded); err != nil || info.Size() != sent.size {
		t.Fatalf("wrong snapshot size: %v", err)
	}
	snapshot, err := tasks.Open(uploaded)
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	got, err := snapshot.Get(ctx, task.ID)
	if err != nil || got.Description != task.Description || got.Version != task.Version {
		t.Fatalf("snapshot lost committed changes: %+v, %v", got, err)
	}
	if _, err := live.Create(ctx, tasks.CreateInput{Title: "Added after backup"}); err != nil {
		t.Fatalf("live database was changed by backing up: %v", err)
	}
}

func TestDriveUploadRefusesUnexpectedSessionURL(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Error("upload reached an unexpected host")
		w.WriteHeader(http.StatusNoContent)
	}))
	defer target.Close()
	initiation := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", target.URL+"/upload?upload_id=test")
		w.WriteHeader(http.StatusOK)
	}))
	defer initiation.Close()
	client := googleDriveClient()
	client.uploadURL = initiation.URL + "/upload"
	path := filepath.Join(t.TempDir(), "famo.db")
	if err := os.WriteFile(path, []byte("private backup"), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	_, err := client.upload(ctx, &oauth2.Token{AccessToken: "test-access"}, path)
	if err == nil || !strings.Contains(err.Error(), "無效的上傳位址") {
		t.Fatalf("unexpected upload response: %v", err)
	}
}

func TestDriveRefreshExpiredAuthorization(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		io.WriteString(w, `{"error":"invalid_grant","error_description":"server response details"}`)
	}))
	defer mock.Close()
	client := googleDriveClient()
	client.endpoint.TokenURL = mock.URL
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	_, err := client.refresh(ctx, driveCredentials{RefreshToken: "test-refresh"})
	if err == nil || !strings.Contains(err.Error(), "請重新授權") || strings.Contains(err.Error(), "server response details") {
		t.Fatalf("unexpected refresh error: %v", err)
	}
}
