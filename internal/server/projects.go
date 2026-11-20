package server

import (
	"net/http"

	"famo/internal/tasks"
	"github.com/go-chi/chi/v5"
)

func projectRoutes(r chi.Router, store *tasks.Store) {
	r.Get("/projects", func(w http.ResponseWriter, r *http.Request) {
		list, err := store.ListProjects(r.Context())
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusOK, list)
	})
	r.Post("/projects", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Name string `json:"name"`
		}
		if !decode(w, r, &in) {
			return
		}
		project, err := store.CreateProject(r.Context(), in.Name)
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusCreated, project)
	})
	r.Post("/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Name    string `json:"name"`
			Version int    `json:"version"`
		}
		if !decode(w, r, &in) {
			return
		}
		project, err := store.RenameProject(r.Context(), chi.URLParam(r, "id"), in.Name, in.Version)
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusOK, project)
	})
}
