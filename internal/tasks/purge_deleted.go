package tasks

import (
	"context"
	"encoding/json"
	"time"
)

// PurgeExpiredDeleted removes tasks whose restore window has ended.
func (s *Store) PurgeExpiredDeleted(ctx context.Context) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.purgeExpiredDeletedAt(ctx, time.Now().UTC())
}

func (s *Store) purgeExpiredDeletedAt(ctx context.Context, now time.Time) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `
		SELECT id, json_extract(document, '$.deleted_at')
		FROM tasks WHERE deleted_at IS NOT NULL`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	// Keep the exact same cutoff as restore, including fractional seconds.
	cutoff := now.Add(-deletionRetention)
	var expired []string
	for rows.Next() {
		var id string
		var timestamp *string
		if err := rows.Scan(&id, &timestamp); err != nil {
			return 0, err
		}
		if timestamp == nil {
			continue
		}
		deletedAt, err := time.Parse(time.RFC3339Nano, *timestamp)
		if err != nil {
			return 0, err
		}
		if !deletedAt.After(cutoff) {
			expired = append(expired, id)
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(expired) == 0 {
		return 0, nil
	}
	ids, err := json.Marshal(expired)
	if err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM task_order WHERE task_id IN (SELECT value FROM json_each(?))`, string(ids)); err != nil {
		return 0, err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM tasks WHERE id IN (SELECT value FROM json_each(?))`, string(ids))
	if err != nil {
		return 0, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return count, nil
}
