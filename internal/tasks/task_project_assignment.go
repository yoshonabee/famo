package tasks

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type TaskVersion struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

// AssignProject updates all tasks in one transaction and returns them in input order.
func (s *Store) AssignProject(ctx context.Context, projectID string, items []TaskVersion) ([]Task, error) {
	if len(items) == 0 {
		return nil, fmt.Errorf("%w：請選擇至少一件任務", ErrInvalid)
	}
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		if item.ID == "" || item.Version < 1 || seen[item.ID] {
			return nil, fmt.Errorf("%w：每件任務須有唯一的 ID 與有效版本", ErrInvalid)
		}
		seen[item.ID] = true
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	now := time.Now().UTC().Format(time.RFC3339Nano)
	updated := make([]Task, 0, len(items))
	for _, item := range items {
		task, err := readTask(tx.QueryRowContext(ctx, `
			UPDATE tasks
			SET version=version+1,
			    document=json_patch(document,json_object('project_id',NULLIF(?,''),'version',version+1,'updated_at',?))
			WHERE id=? AND version=? AND deleted_at IS NULL
			  AND (?='' OR EXISTS(SELECT 1 FROM projects WHERE id=?))
			RETURNING document`, projectID, now, item.ID, item.Version, projectID, projectID))
		if errors.Is(err, ErrNotFound) {
			if err := validateProject(ctx, tx, projectID); err != nil {
				return nil, err
			}
			if _, err := readTask(tx.QueryRowContext(ctx, `SELECT document FROM tasks WHERE id=? AND deleted_at IS NULL`, item.ID)); err != nil {
				return nil, err
			}
			return nil, ErrConflict
		}
		if err != nil {
			return nil, err
		}
		updated = append(updated, task)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return updated, nil
}
