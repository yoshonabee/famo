package server

import (
	"net/http"

	"famo/internal/tasks"
	"github.com/go-chi/chi/v5"
)

func projectRoutes(r chi.Router, store *tasks.Store, settingsEditable bool) {
	canWrite := func(w http.ResponseWriter, in tasks.ProjectInput) bool {
		if settingsEditable || (in.WorkspaceDir == nil && in.WorkspacePrompt == nil) {
			return true
		}
		write(w, http.StatusForbidden, map[string]string{"error": "請在 Famo 內變更 Project 工作區"})
		return false
	}
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
		if !decode(w, r, &in) || !canWrite(w, in) {
			return
		}
		project, err := store.CreateProject(r.Context(), in)
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusCreated, project)
	})
	r.Post("/projects/reorder", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			ProjectIDs []string `json:"project_ids"`
		}
		if !decode(w, r, &in) {
			return
		}
		if err := store.ReorderProjects(r.Context(), in.ProjectIDs); err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusOK, map[string]bool{"ok": true})
	})
	r.Post("/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			tasks.ProjectInput
			Version int `json:"version"`
		}
		if !decode(w, r, &in) || !canWrite(w, in.ProjectInput) {
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
