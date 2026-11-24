package desktop

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"famo/internal/agent"
	"famo/internal/server"
	"famo/internal/syncclient"
	"famo/internal/tasks"

	"github.com/go-chi/chi/v5/middleware"
)

const DefaultAPIAddr = "127.0.0.1:0"

type Config struct {
	DBPath               string
	APIAddr              string // Port 0 is dynamic; empty disables the optional Agent HTTP API.
	APIInfoPath          string // Empty skips publishing discovery information (for embedded callers).
	SyncConfigPath       string
	UseDefaultSyncConfig bool
	onSyncTasksChanged   func()
	onSyncStatusChanged  func()
	UseAPIPreference     bool // Used for the default desktop launch, without an explicit -addr.
}

func DefaultDatabasePath() (string, error) {
	path, err := agent.DefaultAPIInfoPath()
	if err != nil {
		return "", fmt.Errorf("找不到應用程式資料目錄：%w", err)
	}
	return filepath.Join(filepath.Dir(path), "famo.db"), nil
}

func DefaultAPIInfoPath() (string, error) { return agent.DefaultAPIInfoPath() }

type Backend struct {
	handler             http.Handler
	external            http.Handler
	store               *tasks.Store
	apiAddr             string
	apiInfoPath         string
	syncActivity        *syncclient.Activity
	syncPhase           atomic.Value
	onSyncStatusChanged func()

	mu       sync.Mutex
	api      *runningAPI
	closed   bool
	closeErr error
	stopSync func()
}

type runningAPI struct {
	server     *http.Server
	listener   net.Listener
	url        string
	instanceID string
}

// Start shares one store between the native window and the Agent API.
func Start(cfg Config, assets fs.FS) (*Backend, error) {
	if cfg.DBPath == "" {
		return nil, errors.New("請指定資料庫路徑")
	}
	if cfg.APIInfoPath != "" {
		dbPath, err := filepath.Abs(cfg.DBPath)
		if err != nil {
			return nil, err
		}
		infoPath, err := filepath.Abs(cfg.APIInfoPath)
		if err != nil {
			return nil, err
		}
		if dbPath == infoPath {
			return nil, errors.New("資料庫與 Agent API 位址檔案不可使用相同路徑")
		}
	}
	var listener net.Listener
	// Until startAPI succeeds, the caller owns the listener.
	defer func() {
		if listener != nil {
			listener.Close()
		}
	}()
	var err error
	if !cfg.UseAPIPreference && cfg.APIAddr != "" {
		listener, err = listenAPI(cfg.APIAddr)
		if err != nil {
			return nil, err
		}
	}
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0700); err != nil {
		return nil, err
	}
	store, err := tasks.Open(cfg.DBPath)
	if err != nil {
		return nil, err
	}
	b := &Backend{
		store: store, syncActivity: syncclient.NewActivity(5 * time.Minute),
		apiAddr: cfg.APIAddr, apiInfoPath: cfg.APIInfoPath,
		onSyncStatusChanged: cfg.onSyncStatusChanged,
	}
	b.handler = b.observeSyncWrites(server.NewEmbedded(store, assets))
	b.external = b.observeSyncWrites(server.NewDesktopAPI(store, assets))
	if b.apiAddr == "" {
		b.apiAddr = DefaultAPIAddr
	}
	if cfg.UseAPIPreference {
		enabled, err := store.AgentAPIEnabled(context.Background())
		if err != nil {
			store.Close()
			return nil, err
		}
		if enabled {
			listener, err = listenAPI(b.apiAddr)
			if err != nil {
				store.Close()
				return nil, err
			}
		}
	}
	if listener != nil {
		if err := b.startAPI(listener); err != nil {
			store.Close()
			return nil, err
		}
		listener = nil
	} else if err := removeAPIInfo(cfg.APIInfoPath, ""); err != nil {
		store.Close()
		return nil, fmt.Errorf("無法清除 Agent API 位址檔案：%w", err)
	}
	if err := b.startSync(cfg); err != nil {
		b.setSyncPhase(syncclient.StatusError)
		if cfg.SyncConfigPath != "" {
			b.Close()
			return nil, err
		}
		log.Printf("Sync: %v", err)
	}
	return b, nil
}

func (cfg Config) syncConfigPath() string {
	if cfg.SyncConfigPath != "" {
		return cfg.SyncConfigPath
	}
	if cfg.UseDefaultSyncConfig {
		return filepath.Join(filepath.Dir(cfg.DBPath), syncclient.DefaultConfigName)
	}
	return ""
}

func (b *Backend) startSync(cfg Config) error {
	path := cfg.syncConfigPath()
	if path == "" {
		return nil
	}
	config, err := syncclient.ReadConfig(path)
	if errors.Is(err, os.ErrNotExist) && cfg.SyncConfigPath == "" {
		return nil
	}
	if err != nil {
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	runner, err := syncclient.New(ctx, b.store, config, cfg.onSyncTasksChanged)
	if err != nil {
		cancel()
		return err
	}
	done := make(chan struct{})
	b.setSyncPhase(syncclient.StatusPending)
	go func() {
		defer close(done)
		runner.RunWhileActive(ctx, b.syncActivity, func(err error) { log.Printf("Sync: %v", err) }, b.setSyncPhase)
	}()
	b.stopSync = func() {
		cancel()
		<-done
	}
	return nil
}

func (b *Backend) setSyncPhase(phase syncclient.Status) {
	b.syncPhase.Store(phase)
	b.notifySyncStatus()
}

func (b *Backend) notifySyncStatus() {
	if b.onSyncStatusChanged != nil {
		b.onSyncStatusChanged()
	}
}

func (b *Backend) syncStatus(ctx context.Context) (syncclient.Status, error) {
	phase, ok := b.syncPhase.Load().(syncclient.Status)
	if !ok {
		return syncclient.StatusDisabled, nil
	}
	status, err := b.store.SyncStatus(ctx)
	if err != nil {
		return syncclient.StatusError, err
	}
	collections := status.Collections
	switch {
	case len(status.Conflicts) > 0 || (collections != nil && collections.Conflict != nil):
		return syncclient.StatusConflict, nil
	case len(status.Rejections) > 0 || (collections != nil && collections.Rejection != 0):
		return syncclient.StatusError, nil
	case phase == syncclient.StatusSynced && (status.Pending > 0 || (collections != nil && collections.Pending)):
		return syncclient.StatusPending, nil
	default:
		return phase, nil
	}
}

// Both the embedded window and the Agent API write through these handlers.
func (b *Backend) observeSyncWrites(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/")
		path = strings.TrimPrefix(path, "/")
		first, _, _ := strings.Cut(path, "/")
		if r.Method != http.MethodPost || (first != "tasks" && first != "projects" && first != "boards") {
			next.ServeHTTP(w, r)
			return
		}
		response := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(response, r)
		if status := response.Status(); status >= 200 && status < 300 {
			b.syncActivity.LocalWrite()
			if b.syncPhase.Load() != nil {
				b.notifySyncStatus()
			}
		}
	})
}

func listenAPI(addr string) (net.Listener, error) {
	host, _, err := net.SplitHostPort(addr)
	ip := net.ParseIP(host)
	if err != nil || ip == nil || !ip.IsLoopback() {
		return nil, errors.New("Agent API 必須使用 loopback IP，例如 127.0.0.1:8787")
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("無法啟動 Agent API（%s）；請結束另一個 Famo，或使用 -addr 指定其他埠：%w", addr, err)
	}
	return listener, nil
}

func (b *Backend) startAPI(listener net.Listener) error {
	api := &runningAPI{
		listener: listener, url: "http://" + listener.Addr().String(), instanceID: rand.Text(),
	}
	api.server = &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set(InstanceHeader, api.instanceID)
			if expected := r.Header.Get(InstanceHeader); expected != "" && expected != api.instanceID {
				http.Error(w, "Agent API 執行個體已變更", http.StatusPreconditionFailed)
				return
			}
			b.external.ServeHTTP(w, r)
		}),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
	}
	if err := writeAPIInfo(b.apiInfoPath, APIInfo{
		Version: 1, URL: api.url, PID: os.Getpid(), InstanceID: api.instanceID,
	}); err != nil {
		return fmt.Errorf("無法寫入 Agent API 位址檔案：%w", err)
	}
	b.api = api
	go func() {
		if err := api.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("Agent API：%v", err)
		}
	}()
	return nil
}

func (b *Backend) Handler() http.Handler { return b.handler }

func (b *Backend) APIURL() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.api == nil {
		return ""
	}
	return b.api.url
}

func (b *Backend) SetAPIEnabled(enabled bool) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return errors.New("Famo 已關閉")
	}
	if enabled && b.api == nil {
		listener, err := listenAPI(b.apiAddr)
		if err != nil {
			return err
		}
		if err := b.startAPI(listener); err != nil {
			listener.Close()
			return err
		}
		if err := b.store.SetAgentAPIEnabled(context.Background(), true); err != nil {
			return errors.Join(err, b.stopAPI())
		}
		return nil
	}
	if err := b.store.SetAgentAPIEnabled(context.Background(), enabled); err != nil {
		return err
	}
	if !enabled {
		return b.stopAPI()
	}
	return nil
}

func (b *Backend) stopAPI() error {
	api := b.api
	if api == nil {
		return nil
	}
	b.api = nil
	err := removeAPIInfo(b.apiInfoPath, api.instanceID)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if shutdownErr := api.server.Shutdown(ctx); shutdownErr != nil {
		err = errors.Join(err, shutdownErr, api.server.Close())
	}
	// Shutdown can run before Serve registers the listener.
	if closeErr := api.listener.Close(); closeErr != nil && !errors.Is(closeErr, net.ErrClosed) {
		err = errors.Join(err, closeErr)
	}
	return err
}

func (b *Backend) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.closed {
		b.closed = true
		if b.stopSync != nil {
			b.stopSync()
		}
		b.closeErr = errors.Join(b.stopAPI(), b.store.Close())
	}
	return b.closeErr
}
