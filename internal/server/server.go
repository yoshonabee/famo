package server

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"

	"famo/internal/tasks"
	"github.com/go-chi/chi/v5"
)

func New(store *tasks.Store, assets fs.FS) http.Handler {
	r := chi.NewRouter()
	r.Use(recoverer)
	r.Use(localOnly)
	api := func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]string{"status": "ok"}) })
		r.Get("/settings", func(w http.ResponseWriter, r *http.Request) {
			cfg, err := store.Settings(r.Context())
			if err != nil {
				fail(w, err)
				return
			}
			write(w, 200, cfg)
		})
		r.Post("/settings", func(w http.ResponseWriter, r *http.Request) {
			var cfg tasks.Settings
			if !decode(w, r, &cfg) {
				return
			}
			saved, err := store.SaveSettings(r.Context(), cfg)
			if err != nil {
				fail(w, err)
				return
			}
			write(w, 200, saved)
		})
		r.Get("/workflows", func(w http.ResponseWriter, r *http.Request) {
			cfg, err := store.Settings(r.Context())
			if err != nil {
				fail(w, err)
				return
			}
			write(w, 200, cfg.Workflows)
		})
		r.Get("/tasks", func(w http.ResponseWriter, r *http.Request) {
			list, err := store.List(r.Context())
			if err != nil {
				fail(w, err)
				return
			}
			write(w, 200, list)
		})
		r.Post("/tasks", func(w http.ResponseWriter, r *http.Request) {
			var in struct {
				tasks.CreateInput
				Priority *int `json:"priority"`
			}
			if !decode(w, r, &in) {
				return
			}
			cfg, err := store.Settings(r.Context())
			if err != nil {
				fail(w, err)
				return
			}
			if in.Priority == nil {
				in.CreateInput.Priority = cfg.DefaultPriority
			} else {
				in.CreateInput.Priority = *in.Priority
			}
			t, err := store.Create(r.Context(), in.CreateInput)
			if err != nil {
				fail(w, err)
				return
			}
			write(w, 201, t)
		})
		r.Post("/tasks/reorder", func(w http.ResponseWriter, r *http.Request) {
			var in struct {
				TaskIDs []string `json:"task_ids"`
			}
			if !decode(w, r, &in) {
				return
			}
			if err := store.Reorder(r.Context(), in.TaskIDs); err != nil {
				fail(w, err)
				return
			}
			list, err := store.List(r.Context())
			if err != nil {
				fail(w, err)
				return
			}
			write(w, 200, list)
		})
		get := func(w http.ResponseWriter, r *http.Request) {
			t, err := store.Get(r.Context(), chi.URLParam(r, "id"))
			if err != nil {
				fail(w, err)
				return
			}
			write(w, 200, t)
		}
		r.Get("/tasks/{id}", get)
		r.Get("/tasks/{id}/context", get)
		r.Post("/tasks/{id}/actions", func(w http.ResponseWriter, r *http.Request) {
			var a tasks.Action
			if !decode(w, r, &a) {
				return
			}
			t, err := store.Act(r.Context(), chi.URLParam(r, "id"), a)
			if err != nil {
				fail(w, err)
				return
			}
			write(w, 200, t)
		})
	}
	r.Route("/api", api)
	r.Group(api)
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/tasks/") {
			write(w, 404, map[string]string{"error": "找不到 API"})
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			w.WriteHeader(405)
			return
		}
		if _, err := fs.Stat(assets, "index.html"); err != nil {
			http.Error(w, "前端尚未建置，請先執行 make build，或用 npm run dev 開發前端。", 503)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(assets, path); err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.FileServer(http.FS(assets)).ServeHTTP(w, r)
	})
	return r
}
func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("request panic: %v", err)
				write(w, 500, map[string]string{"error": "伺服器發生錯誤，請重試"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
func localOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if host != "localhost" && host != "127.0.0.1" && host != "::1" {
			http.Error(w, "僅允許本機存取", 403)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || (u.Host != r.Host && u.Host != "localhost:5173" && u.Host != "127.0.0.1:5173") {
				http.Error(w, "不允許的來源", 403)
				return
			}
		}
		if r.Method == "POST" && strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
			write(w, 415, map[string]string{"error": "請使用 application/json"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		write(w, 400, map[string]string{"error": "無效的 JSON：" + err.Error()})
		return false
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		write(w, 400, map[string]string{"error": "請只提供一個 JSON 物件"})
		return false
	}
	return true
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode response: %v", err)
	}
}
func fail(w http.ResponseWriter, err error) {
	status := 500
	message := err.Error()
	if errors.Is(err, tasks.ErrInvalid) {
		status = 400
	}
	if errors.Is(err, tasks.ErrNotFound) {
		status = 404
	}
	if errors.Is(err, tasks.ErrConflict) {
		status = 409
	}
	if status == 500 {
		log.Printf("task storage error: %v", err)
		message = "資料存取失敗，請重試"
	}
	write(w, status, map[string]string{"error": message})
}
