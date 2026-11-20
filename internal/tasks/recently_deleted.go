package tasks

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"time"
)

const deletionRetention = 7 * 24 * time.Hour

func (s *Store) ListRecentlyDeleted(ctx context.Context) ([]Task, error) {
	return s.listRecentlyDeletedAt(ctx, time.Now().UTC())
}

func (s *Store) listRecentlyDeletedAt(ctx context.Context, now time.Time) ([]Task, error) {
	cutoff := now.Add(-deletionRetention)
	// Select by the ISO timestamp in the document. The SQL filter has
	// second precision, so check the exact cutoff after decoding.
	rows, err := s.db.QueryContext(ctx, `
		SELECT document FROM tasks
		WHERE deleted_at IS NOT NULL AND unixepoch(json_extract(document,'$.deleted_at')) >= ?`,
		cutoff.Unix(),
	)
	if err != nil {
		return nil, err
	}
	list, err := readTasks(rows)
	if err != nil {
		return nil, err
	}
	list = slices.DeleteFunc(list, func(t Task) bool { return !canRestore(t, cutoff) })
	slices.SortFunc(list, func(a, b Task) int {
		if order := b.DeletedAt.Compare(*a.DeletedAt); order != 0 {
			return order
		}
		return strings.Compare(a.ID, b.ID)
	})
	return list, nil
}

func (s *Store) Restore(ctx context.Context, id string, version int) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.restoreAt(ctx, id, version, time.Now().UTC())
}

func (s *Store) restoreAt(ctx context.Context, id string, version int, now time.Time) (Task, error) {
	task, err := readTask(s.db.QueryRowContext(ctx, `SELECT document FROM tasks WHERE id=? AND deleted_at IS NOT NULL`, id))
	if err != nil {
		return Task{}, err
	}
	if !canRestore(task, now.Add(-deletionRetention)) {
		return Task{}, ErrNotFound
	}
	if task.Version != version {
		return Task{}, ErrConflict
	}
	task.DeletedAt = nil
	task.UpdatedAt = now
	task.Version++
	raw, err := json.Marshal(task)
	if err != nil {
		return Task{}, err
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE tasks SET deleted_at=NULL,version=?,document=?
		WHERE id=? AND version=? AND deleted_at IS NOT NULL`, task.Version, string(raw), id, version)
	if err != nil {
		return Task{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return Task{}, err
	}
	if changed != 1 {
		return Task{}, ErrConflict
	}
	return task, nil
}

func canRestore(t Task, cutoff time.Time) bool {
	return t.DeletedAt != nil && t.DeletedAt.After(cutoff)
}
