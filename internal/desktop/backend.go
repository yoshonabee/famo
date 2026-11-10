package desktop

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"famo/internal/server"
	"famo/internal/tasks"
)

const DefaultAPIAddr = "127.0.0.1:8787"

type Config struct {
	DBPath  string
	APIAddr string // Empty disables the optional Agent HTTP API.
}

// DefaultDatabasePath is independent of Finder's working directory.
func DefaultDatabasePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("找不到應用程式資料目錄：%w", err)
	}
	return filepath.Join(dir, "Famo", "famo.db"), nil
}

type Backend struct {
	handler  http.Handler
	store    *tasks.Store
	api      *http.Server
	apiURL   string
	closed   sync.Once
	closeErr error
}

// Start shares one store between the native window and the Agent API.
func Start(cfg Config, assets fs.FS) (*Backend, error) {
	if cfg.DBPath == "" {
		return nil, errors.New("請指定資料庫路徑")
	}
	var listener net.Listener
	if cfg.APIAddr != "" {
		host, _, err := net.SplitHostPort(cfg.APIAddr)
		ip := net.ParseIP(host)
		if err != nil || ip == nil || !ip.IsLoopback() {
			return nil, errors.New("Agent API 必須使用 loopback IP，例如 127.0.0.1:8787")
		}
		listener, err = net.Listen("tcp", cfg.APIAddr)
		if err != nil {
			return nil, fmt.Errorf("無法啟動 Agent API（%s）；請結束另一個 Famo，或使用 -addr 指定其他埠：%w", cfg.APIAddr, err)
		}
	}
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0700); err != nil {
		if listener != nil {
			listener.Close()
		}
		return nil, err
	}
	store, err := tasks.Open(cfg.DBPath)
	if err != nil {
		if listener != nil {
			listener.Close()
		}
		return nil, err
	}
	b := &Backend{store: store, handler: server.NewEmbedded(store, assets)}
	if listener != nil {
		b.apiURL = "http://" + listener.Addr().String()
		b.api = &http.Server{
			Handler:           server.New(store, assets),
			ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
			WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second,
		}
		go func() {
			if err := b.api.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Printf("Agent API：%v", err)
			}
		}()
	}
	return b, nil
}

func (b *Backend) Handler() http.Handler { return b.handler }
func (b *Backend) APIURL() string        { return b.apiURL }

func (b *Backend) Close() error {
	b.closed.Do(func() {
		if b.api != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			b.closeErr = b.api.Shutdown(ctx)
			if b.closeErr != nil {
				b.closeErr = errors.Join(b.closeErr, b.api.Close())
			}
		}
		b.closeErr = errors.Join(b.closeErr, b.store.Close())
	})
	return b.closeErr
}
