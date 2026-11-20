package desktop

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"
	"time"

	"famo/internal/tasks"
	"golang.org/x/oauth2"
)

const (
	driveScope     = "https://www.googleapis.com/auth/drive.file"
	driveMIME      = "application/vnd.sqlite3"
	driveUploadURL = "https://www.googleapis.com/upload/drive/v3/files"
	driveJSONLimit = 64 << 10
)

var (
	driveClientID = regexp.MustCompile(`^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$`)
	driveFileID   = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
)

type driveCredentials struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

type DriveBackupResult struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type driveClient struct {
	endpoint  oauth2.Endpoint
	uploadURL string
	http      *http.Client
}

func googleDriveClient() driveClient {
	return driveClient{
		endpoint: oauth2.Endpoint{
			AuthURL:   "https://accounts.google.com/o/oauth2/v2/auth",
			TokenURL:  "https://oauth2.googleapis.com/token",
			AuthStyle: oauth2.AuthStyleInParams,
		},
		uploadURL: driveUploadURL,
		http: &http.Client{
			// Credentials and backup bytes must stay on their intended endpoints.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

func readDriveCredentials(path string) (driveCredentials, error) {
	invalid := errors.New("請選擇 Google Cloud 下載的「桌面應用程式」OAuth 用戶端 JSON")
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > driveJSONLimit {
		return driveCredentials{}, invalid
	}
	file, err := os.Open(path)
	if err != nil {
		return driveCredentials{}, errors.New("無法開啟 OAuth 用戶端檔案")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, driveJSONLimit+1))
	if err != nil || len(data) > driveJSONLimit {
		return driveCredentials{}, invalid
	}
	var document struct {
		Installed struct {
			ClientID     string `json:"client_id"`
			ClientSecret string `json:"client_secret"`
		} `json:"installed"`
	}
	if err := json.Unmarshal(data, &document); err != nil || !driveClientID.MatchString(document.Installed.ClientID) {
		return driveCredentials{}, invalid
	}
	// Use only the client identifiers. The JSON cannot set OAuth endpoint URLs.
	return driveCredentials{ClientID: document.Installed.ClientID, ClientSecret: document.Installed.ClientSecret}, nil
}

func (c driveClient) oauthConfig(credentials driveCredentials) oauth2.Config {
	return oauth2.Config{
		ClientID: credentials.ClientID, ClientSecret: credentials.ClientSecret,
		Scopes: []string{driveScope}, Endpoint: c.endpoint,
	}
}

func (c driveClient) authorize(ctx context.Context, credentials driveCredentials, openBrowser func(string) error) (driveCredentials, error) {
	listener, err := (&net.ListenConfig{}).Listen(ctx, "tcp4", "127.0.0.1:0")
	if err != nil {
		if ctx.Err() != nil {
			return driveCredentials{}, driveContextError(ctx)
		}
		return driveCredentials{}, errors.New("無法啟動 Google 授權接收器")
	}
	defer listener.Close()
	const callbackPath = "/oauth2/callback"
	host := listener.Addr().String()
	config := c.oauthConfig(credentials)
	config.RedirectURL = "http://" + host + callbackPath
	state, verifier := rand.Text(), oauth2.GenerateVerifier()

	codes := make(chan string, 1)
	var receive sync.Once
	server := &http.Server{
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			if r.Host != host || r.URL.Path != callbackPath || r.Method != http.MethodGet {
				http.NotFound(w, r)
				return
			}
			query := r.URL.Query()
			if subtle.ConstantTimeCompare([]byte(query.Get("state")), []byte(state)) != 1 {
				http.Error(w, "授權回應無效。", http.StatusBadRequest)
				return
			}
			code := query.Get("code")
			if query.Get("error") != "" {
				code = ""
			}
			fmt.Fprintln(w, "請回到 Famo 查看授權結果。")
			_ = http.NewResponseController(w).Flush()
			receive.Do(func() { codes <- code })
		}),
	}
	defer server.Close()
	go server.Serve(listener)

	authURL := config.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.S256ChallengeOption(verifier), oauth2.SetAuthURLParam("prompt", "consent select_account"))
	if err := openBrowser(authURL); err != nil {
		return driveCredentials{}, errors.New("無法開啟瀏覽器進行 Google 授權")
	}
	select {
	case <-ctx.Done():
		return driveCredentials{}, driveContextError(ctx)
	case code := <-codes:
		if code == "" {
			return driveCredentials{}, errors.New("Google Drive 未授權，請重試")
		}
		token, err := config.Exchange(context.WithValue(ctx, oauth2.HTTPClient, c.http), code, oauth2.VerifierOption(verifier))
		if ctx.Err() != nil {
			return driveCredentials{}, driveContextError(ctx)
		}
		if err != nil || token.RefreshToken == "" {
			return driveCredentials{}, errors.New("無法完成 Google 授權，請確認 OAuth 用戶端設定後重試")
		}
		credentials.RefreshToken = token.RefreshToken
		return credentials, nil
	}
}

func (c driveClient) refresh(ctx context.Context, credentials driveCredentials) (*oauth2.Token, error) {
	config := c.oauthConfig(credentials)
	token, err := config.TokenSource(context.WithValue(ctx, oauth2.HTTPClient, c.http), &oauth2.Token{
		RefreshToken: credentials.RefreshToken,
	}).Token()
	if ctx.Err() != nil {
		return nil, driveContextError(ctx)
	}
	if err != nil {
		var authError *oauth2.RetrieveError
		if errors.As(err, &authError) && (authError.ErrorCode == "invalid_grant" || authError.ErrorCode == "invalid_client") {
			return nil, errors.New("Google Drive 授權已失效，請重新授權")
		}
		return nil, errors.New("無法更新 Google Drive 授權，請確認網路連線後重試")
	}
	if !token.Valid() {
		return nil, errors.New("Google Drive 授權回應無效，請重新授權")
	}
	return token, nil
}

func (c driveClient) backup(ctx context.Context, token *oauth2.Token, dbPath string) (DriveBackupResult, error) {
	dir, err := os.MkdirTemp("", "famo-drive-*")
	if err != nil {
		return DriveBackupResult{}, fmt.Errorf("無法建立暫存備份資料夾：%w", err)
	}
	defer os.RemoveAll(dir)
	name := "famo-backup-" + time.Now().UTC().Format("20060102-150405.000Z") + ".db"
	path := filepath.Join(dir, name)
	if err := tasks.BackupDatabase(ctx, dbPath, path); err != nil {
		if ctx.Err() != nil {
			return DriveBackupResult{}, driveContextError(ctx)
		}
		return DriveBackupResult{}, fmt.Errorf("無法建立 SQLite 備份：%w", err)
	}
	return c.upload(ctx, token, path)
}

func (c driveClient) upload(ctx context.Context, token *oauth2.Token, path string) (DriveBackupResult, error) {
	file, err := os.Open(path)
	if err != nil {
		return DriveBackupResult{}, fmt.Errorf("無法讀取備份：%w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return DriveBackupResult{}, fmt.Errorf("無法讀取備份大小：%w", err)
	}
	metadata, err := json.Marshal(map[string]string{"name": info.Name(), "mimeType": driveMIME})
	if err != nil {
		return DriveBackupResult{}, err
	}
	endpoint, err := url.Parse(c.uploadURL)
	if err != nil {
		return DriveBackupResult{}, err
	}
	query := endpoint.Query()
	query.Set("uploadType", "resumable")
	query.Set("fields", "id")
	endpoint.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewReader(metadata))
	if err != nil {
		return DriveBackupResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Upload-Content-Type", driveMIME)
	req.Header.Set("X-Upload-Content-Length", strconv.FormatInt(info.Size(), 10))
	token.SetAuthHeader(req)
	res, err := c.http.Do(req)
	if err != nil {
		return DriveBackupResult{}, driveRequestError(ctx, 0)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return DriveBackupResult{}, driveRequestError(ctx, res.StatusCode)
	}
	session, err := url.Parse(res.Header.Get("Location"))
	if err != nil || session.Scheme != endpoint.Scheme || session.Host != endpoint.Host ||
		session.Path != endpoint.Path || session.User != nil || session.Fragment != "" || session.Query().Get("upload_id") == "" {
		return DriveBackupResult{}, errors.New("Google Drive 回傳無效的上傳位址")
	}

	req, err = http.NewRequestWithContext(ctx, http.MethodPut, session.String(), file)
	if err != nil {
		return DriveBackupResult{}, driveRequestError(ctx, 0)
	}
	req.ContentLength = info.Size()
	req.Header.Set("Content-Type", driveMIME)
	token.SetAuthHeader(req)
	res, err = c.http.Do(req)
	if err != nil {
		return DriveBackupResult{}, driveRequestError(ctx, 0)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusCreated {
		return DriveBackupResult{}, driveRequestError(ctx, res.StatusCode)
	}
	var uploaded struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, driveJSONLimit)).Decode(&uploaded); err != nil || !driveFileID.MatchString(uploaded.ID) {
		return DriveBackupResult{}, errors.New("無法確認 Google Drive 備份結果，請先檢查「我的雲端硬碟」")
	}
	return DriveBackupResult{
		Name: info.Name(),
		URL:  "https://drive.google.com/open?id=" + uploaded.ID,
	}, nil
}

func driveContextError(ctx context.Context) error {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return errors.New("Google Drive 操作逾時，請重試")
	}
	return errors.New("Google Drive 操作已取消")
}

func driveRequestError(ctx context.Context, status int) error {
	if ctx.Err() != nil {
		return driveContextError(ctx)
	}
	switch status {
	case 0:
		return errors.New("無法連線至 Google Drive，請確認網路後重試")
	case http.StatusUnauthorized:
		return errors.New("Google Drive 授權已失效，請重新授權")
	case http.StatusForbidden:
		return errors.New("Google Drive 拒絕上傳，請確認已啟用 Drive API、授權與儲存空間")
	default:
		return fmt.Errorf("Google Drive 上傳失敗（HTTP %d），請重試", status)
	}
}
