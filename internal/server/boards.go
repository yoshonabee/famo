package server

import (
	"net/http"

	"famo/internal/tasks"
	"github.com/go-chi/chi/v5"
)

func boardRoutes(r chi.Router, store *tasks.Store) {
	r.Get("/boards", func(w http.ResponseWriter, r *http.Request) {
		list, err := store.ListBoards(r.Context())
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusOK, list)
	})
	r.Post("/boards", func(w http.ResponseWriter, r *http.Request) {
		var in tasks.BoardInput
		if !decode(w, r, &in) {
			return
		}
		board, err := store.CreateBoard(r.Context(), in)
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusCreated, board)
	})
	r.Post("/boards/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			tasks.BoardInput
			Version int `json:"version"`
		}
		if !decode(w, r, &in) {
			return
		}
		board, err := store.UpdateBoard(r.Context(), chi.URLParam(r, "id"), in.BoardInput, in.Version)
		if err != nil {
			fail(w, err)
			return
		}
		write(w, http.StatusOK, board)
	})
}
