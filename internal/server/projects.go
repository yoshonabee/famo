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
		var in tasks.ProjectInput
		if !decode(w, r, &in) {
			return
		}
		project, err := store.CreateProject(r.Context(), in)
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusCreated, project)
	})
	r.Post("/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			tasks.ProjectInput
			Version int `json:"version"`
		}
		if !decode(w, r, &in) {
			return
		}
		project, err := store.UpdateProject(r.Context(), chi.URLParam(r, "id"), in.ProjectInput, in.Version)
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusOK, project)
	})
	r.Post("/projects/{id}/delete", deleteCollection(store.DeleteProject))
}
