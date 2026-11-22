package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// SyncOperation carries a full task snapshot with a cloud version independent
// of the SQLite version used by local editing clients.
type SyncOperation struct {
	OperationID string `json:"operation_id"`
	TaskID      string `json:"task_id"`
	BaseVersion int    `json:"base_version"`
	Task        Task   `json:"task"`
}

type SyncChange struct {
	Sequence int64 `json:"sequence"`
	Task     Task  `json:"task"`
}

type SyncConflict struct {
	TaskID string `json:"task_id"`
	Local  Task   `json:"local"`
	Remote *Task  `json:"remote"`
}

type SyncRejection struct {
	TaskID string `json:"task_id"`
	Status int    `json:"status"`
}

type SyncStatus struct {
	URL         string                `json:"url"`
	Account     string                `json:"account"`
	Cursor      int64                 `json:"cursor"`
	Pending     int                   `json:"pending"`
	Conflicts   []SyncConflict        `json:"conflicts"`
	Rejections  []SyncRejection       `json:"rejections"`
	Collections *CollectionSyncStatus `json:"collections,omitempty"`
}

// The triggers enqueue content writes in the transaction that changes tasks,
// including bulk assignment, Project deletion, and restoration. Physical
// expiration removes local tombstones after their normal seven-day retention.
const syncSchema = `
CREATE TABLE IF NOT EXISTS sync_binding (
    id INTEGER PRIMARY KEY CHECK(id=1),
    url TEXT NOT NULL,
    account TEXT NOT NULL,
    cursor INTEGER NOT NULL DEFAULT 0,
    applying INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync_versions (
    task_id TEXT PRIMARY KEY NOT NULL,
    version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_outbox (
    number INTEGER PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    task_id TEXT NOT NULL,
    base_version INTEGER NOT NULL,
    document TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_outbox_task ON sync_outbox(task_id,number);
CREATE TABLE IF NOT EXISTS sync_conflicts (
    task_id TEXT PRIMARY KEY NOT NULL,
    remote TEXT
);
CREATE TABLE IF NOT EXISTS sync_deferred (
    task_id TEXT PRIMARY KEY NOT NULL,
    version INTEGER NOT NULL,
    document TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_rejections (
    task_id TEXT PRIMARY KEY NOT NULL,
    status INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS tasks_sync_insert AFTER INSERT ON tasks
WHEN (SELECT applying=0 FROM sync_binding WHERE id=1)
BEGIN
` + enqueueTask + `
END;
CREATE TRIGGER IF NOT EXISTS tasks_sync_update AFTER UPDATE OF document ON tasks
WHEN (SELECT applying=0 FROM sync_binding WHERE id=1)
BEGIN
` + enqueueTask + `
END;
`

const enqueueTask = `
    INSERT INTO sync_outbox(operation_id,task_id,base_version,document)
    VALUES(lower(hex(randomblob(16))),NEW.id,CASE
        WHEN EXISTS(SELECT 1 FROM sync_rejections WHERE task_id=NEW.id) THEN
            (SELECT base_version FROM sync_outbox WHERE task_id=NEW.id ORDER BY number LIMIT 1)
        ELSE COALESCE(
            (SELECT base_version+1 FROM sync_outbox WHERE task_id=NEW.id ORDER BY number DESC LIMIT 1),
            (SELECT version FROM sync_versions WHERE task_id=NEW.id),0)
        END,NEW.document);
    DELETE FROM sync_outbox WHERE task_id=NEW.id
        AND EXISTS(SELECT 1 FROM sync_rejections WHERE task_id=NEW.id)
        AND number<(SELECT MAX(number) FROM sync_outbox WHERE task_id=NEW.id);
    DELETE FROM sync_rejections WHERE task_id=NEW.id;
`

// BindSync records the destination before any upload. A populated database and
// its pending edits stay attached to one destination, even while sync is paused.
func (s *Store) BindSync(ctx context.Context, url, account string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var oldURL, oldAccount string
	err = tx.QueryRowContext(ctx, `SELECT url,account FROM sync_binding WHERE id=1`).Scan(&oldURL, &oldAccount)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		if _, err := tx.ExecContext(ctx, `INSERT INTO sync_binding(id,url,account) VALUES(1,?,?)`, url, account); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sync_outbox(operation_id,task_id,base_version,document)
			SELECT lower(hex(randomblob(16))),t.id,0,t.document
			FROM tasks t LEFT JOIN task_order o ON o.task_id=t.id ORDER BY o.position,t.id`); err != nil {
			return err
		}
	case err != nil:
		return err
	case oldURL != url || oldAccount != account:
		return errors.New("sync database is bound to a different URL or account; use a separate database")
	}
	return tx.Commit()
}

func (s *Store) SyncOperations(ctx context.Context, limit int) ([]SyncOperation, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT o.operation_id,o.task_id,o.base_version,o.document
		FROM sync_outbox o
		WHERE NOT EXISTS (SELECT 1 FROM sync_conflicts c WHERE c.task_id=o.task_id)
		  AND NOT EXISTS (SELECT 1 FROM sync_rejections r WHERE r.task_id=o.task_id)
		  AND o.number=(SELECT MIN(number) FROM sync_outbox WHERE task_id=o.task_id)
		ORDER BY o.number LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SyncOperation
	for rows.Next() {
		var op SyncOperation
		var raw string
		if err := rows.Scan(&op.OperationID, &op.TaskID, &op.BaseVersion, &raw); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(raw), &op.Task); err != nil {
			return nil, err
		}
		op.Task.Version = op.BaseVersion + 1
		if op.Task.Links == nil {
			op.Task.Links = []Link{}
		}
		out = append(out, op)
	}
	return out, rows.Err()
}

func (s *Store) SyncCursor(ctx context.Context) (int64, error) {
	var cursor int64
	err := s.db.QueryRowContext(ctx, `SELECT cursor FROM sync_binding WHERE id=1`).Scan(&cursor)
	return cursor, err
}

func (s *Store) AcknowledgeSync(ctx context.Context, op SyncOperation) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `DELETE FROM sync_outbox WHERE operation_id=?`, op.OperationID)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	if err != nil || count == 0 {
		return false, err
	}
	if err := setSyncVersion(ctx, tx, op.TaskID, op.Task.Version); err != nil {
		return false, err
	}
	changed, err := applyDeferredSyncChange(ctx, tx, op.TaskID)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return changed, nil
}

func applyDeferredSyncChange(ctx context.Context, tx *sql.Tx, taskID string) (bool, error) {
	var raw string
	err := tx.QueryRowContext(ctx, `
		DELETE FROM sync_deferred WHERE task_id=?
		  AND NOT EXISTS(SELECT 1 FROM sync_outbox WHERE task_id=?)
		RETURNING document`, taskID, taskID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var task Task
	if err := json.Unmarshal([]byte(raw), &task); err != nil {
		return false, err
	}
	if err := suppressSyncTriggers(ctx, tx, true); err != nil {
		return false, err
	}
	changed, err := applySyncChange(ctx, tx, task)
	if err != nil {
		return false, err
	}
	return changed, suppressSyncTriggers(ctx, tx, false)
}

func (s *Store) RecordSyncConflict(ctx context.Context, op SyncOperation, remote *Task) error {
	raw, err := syncTaskDocument(remote)
	if err != nil {
		return err
	}
	version := 0
	if remote != nil {
		version = remote.Version
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO sync_conflicts(task_id,remote)
		SELECT o.task_id,CASE WHEN d.version>? THEN d.document ELSE ? END
		FROM sync_outbox o LEFT JOIN sync_deferred d ON d.task_id=o.task_id WHERE o.operation_id=?
		ON CONFLICT(task_id) DO NOTHING`, version, raw, op.OperationID)
	return err
}

// RecordSyncRejection pauses a definitively rejected operation. Edits made
// while it was in flight can be retried immediately using its unchanged base
// version. Otherwise a future local edit replaces the rejected snapshot.
func (s *Store) RecordSyncRejection(ctx context.Context, op SyncOperation, status int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var latestID, raw string
	err = tx.QueryRowContext(ctx, `
		SELECT operation_id,document FROM sync_outbox
		WHERE task_id=(SELECT task_id FROM sync_outbox WHERE operation_id=?)
		ORDER BY number DESC LIMIT 1`, op.OperationID).Scan(&latestID, &raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if latestID == op.OperationID {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO sync_rejections(task_id,status) VALUES(?,?)
			ON CONFLICT(task_id) DO UPDATE SET status=excluded.status`, op.TaskID, status)
	} else {
		_, err = tx.ExecContext(ctx, `DELETE FROM sync_outbox WHERE task_id=?`, op.TaskID)
		if err == nil {
			_, err = tx.ExecContext(ctx, `
				INSERT INTO sync_outbox(operation_id,task_id,base_version,document) VALUES(?,?,?,?)`,
				id(), op.TaskID, op.BaseVersion, raw)
		}
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}

func syncTaskDocument(task *Task) (*string, error) {
	if task == nil {
		return nil, nil
	}
	data, err := json.Marshal(task)
	raw := string(data)
	return &raw, err
}

func setSyncVersion(ctx context.Context, tx *sql.Tx, taskID string, version int) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO sync_versions(task_id,version) VALUES(?,?)
		ON CONFLICT(task_id) DO UPDATE SET version=MAX(sync_versions.version,excluded.version)`,
		taskID, version)
	return err
}

func suppressSyncTriggers(ctx context.Context, tx *sql.Tx, suppress bool) error {
	_, err := tx.ExecContext(ctx, `UPDATE sync_binding SET applying=? WHERE id=1`, suppress)
	return err
}

// ApplySyncChanges applies remote snapshots and advances the cursor in the
// same transaction. Pending local snapshots are held until push acknowledges
// them or records a conflict.
func (s *Store) ApplySyncChanges(ctx context.Context, changes []SyncChange, cursor int64) (bool, error) {
	if len(changes) == 0 {
		return false, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	if err := suppressSyncTriggers(ctx, tx, true); err != nil {
		return false, err
	}
	var changed bool
	for _, change := range changes {
		applied, err := applySyncChange(ctx, tx, change.Task)
		if err != nil {
			return false, err
		}
		changed = changed || applied
	}
	if _, err := tx.ExecContext(ctx, `UPDATE sync_binding SET cursor=MAX(cursor,?) WHERE id=1`, cursor); err != nil {
		return false, err
	}
	if err := suppressSyncTriggers(ctx, tx, false); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return changed, nil
}

func applySyncChange(ctx context.Context, tx *sql.Tx, task Task) (bool, error) {
	var known int
	var pending bool
	err := tx.QueryRowContext(ctx, `
		SELECT COALESCE((SELECT version FROM sync_versions WHERE task_id=?),0),
		       EXISTS(SELECT 1 FROM sync_outbox WHERE task_id=?)`, task.ID, task.ID).Scan(&known, &pending)
	if err != nil || known >= task.Version {
		return false, err
	}
	if pending {
		raw, err := syncTaskDocument(&task)
		if err != nil {
			return false, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sync_deferred(task_id,version,document) VALUES(?,?,?)
			ON CONFLICT(task_id) DO UPDATE SET version=excluded.version,document=excluded.document
			WHERE excluded.version>sync_deferred.version`, task.ID, task.Version, raw); err != nil {
			return false, err
		}
		_, err = tx.ExecContext(ctx, `
			UPDATE sync_conflicts SET remote=? WHERE task_id=?
			AND COALESCE(json_extract(remote,'$.version'),0)<?`, raw, task.ID, task.Version)
		return false, err
	}
	if err := writeRemoteTask(ctx, tx, task); err != nil {
		return false, err
	}
	return true, setSyncVersion(ctx, tx, task.ID, task.Version)
}

func writeRemoteTask(ctx context.Context, tx *sql.Tx, task Task) error {
	err := tx.QueryRowContext(ctx, `SELECT MAX(version+1,?) FROM tasks WHERE id=?`, task.Version, task.ID).Scan(&task.Version)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if errors.Is(err, sql.ErrNoRows) && task.DeletedAt != nil && !canRestore(task, time.Now().UTC().Add(-deletionRetention)) {
		return nil
	}
	if task.ProjectID != "" {
		var removed bool
		err := tx.QueryRowContext(ctx, `
			SELECT EXISTS(SELECT 1 FROM sync_removed_projects WHERE id=?)
			    AND NOT EXISTS(SELECT 1 FROM projects WHERE id=?)`, task.ProjectID, task.ProjectID).Scan(&removed)
		if err != nil {
			return err
		}
		if removed {
			task.ProjectID = ""
		}
	}
	if err := validate(task); err != nil {
		return fmt.Errorf("invalid synced task %q: %w", task.ID, err)
	}
	raw, err := json.Marshal(task)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO tasks(id,completed_at,deleted_at,version,document) VALUES(?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET completed_at=excluded.completed_at,deleted_at=excluded.deleted_at,
			version=excluded.version,document=excluded.document`, task.ID, task.CompletedAt, task.DeletedAt, task.Version, string(raw))
	return err
}

func (s *Store) SyncStatus(ctx context.Context) (SyncStatus, error) {
	status := SyncStatus{Conflicts: []SyncConflict{}, Rejections: []SyncRejection{}}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return SyncStatus{}, err
	}
	defer tx.Rollback()
	err = tx.QueryRowContext(ctx, `
		SELECT url,account,cursor,(SELECT COUNT(*) FROM sync_outbox) FROM sync_binding WHERE id=1`,
	).Scan(&status.URL, &status.Account, &status.Cursor, &status.Pending)
	if errors.Is(err, sql.ErrNoRows) {
		return status, nil
	}
	if err != nil {
		return SyncStatus{}, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT c.task_id,
		COALESCE(t.document,(SELECT document FROM sync_outbox WHERE task_id=c.task_id ORDER BY number DESC LIMIT 1)),
		c.remote FROM sync_conflicts c LEFT JOIN tasks t ON t.id=c.task_id ORDER BY c.task_id`)
	if err != nil {
		return SyncStatus{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var conflict SyncConflict
		var local string
		var remote *string
		if err := rows.Scan(&conflict.TaskID, &local, &remote); err != nil {
			return SyncStatus{}, err
		}
		if err := json.Unmarshal([]byte(local), &conflict.Local); err != nil {
			return SyncStatus{}, err
		}
		if remote != nil {
			if err := json.Unmarshal([]byte(*remote), &conflict.Remote); err != nil {
				return SyncStatus{}, err
			}
		}
		status.Conflicts = append(status.Conflicts, conflict)
	}
	if err := rows.Err(); err != nil {
		return SyncStatus{}, err
	}
	rows, err = tx.QueryContext(ctx, `SELECT task_id,status FROM sync_rejections ORDER BY task_id`)
	if err != nil {
		return SyncStatus{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var rejection SyncRejection
		if err := rows.Scan(&rejection.TaskID, &rejection.Status); err != nil {
			return SyncStatus{}, err
		}
		status.Rejections = append(status.Rejections, rejection)
	}
	if err := rows.Err(); err != nil {
		return SyncStatus{}, err
	}
	collections, err := collectionStatus(ctx, tx)
	if err != nil {
		return SyncStatus{}, err
	}
	status.Collections = &collections
	return status, nil
}

// ResolveSyncConflict replaces all queued snapshots for a conflicted task with
// the chosen draft. Choosing local queues a new operation against the remote
// version the user inspected. A further remote edit can conflict again.
func (s *Store) ResolveSyncConflict(ctx context.Context, taskID string, localVersion, remoteVersion int, keepLocal bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var local string
	var remote *string
	err = tx.QueryRowContext(ctx, `
		SELECT COALESCE(
			(SELECT document FROM tasks WHERE id=c.task_id),
			(SELECT document FROM sync_outbox WHERE task_id=c.task_id ORDER BY number DESC LIMIT 1)),c.remote
		FROM sync_conflicts c WHERE c.task_id=?`, taskID).Scan(&local, &remote)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("no sync conflict for task %q", taskID)
	}
	if err != nil {
		return err
	}
	var remoteTask Task
	if remote != nil {
		if err := json.Unmarshal([]byte(*remote), &remoteTask); err != nil {
			return err
		}
	}
	var localTask Task
	if err := json.Unmarshal([]byte(local), &localTask); err != nil {
		return err
	}
	if localTask.Version != localVersion || remoteTask.Version != remoteVersion {
		return fmt.Errorf("sync conflict changed for task %q; read sync status again", taskID)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sync_outbox WHERE task_id=?`, taskID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sync_conflicts WHERE task_id=?`, taskID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sync_deferred WHERE task_id=?`, taskID); err != nil {
		return err
	}
	if keepLocal {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sync_outbox(operation_id,task_id,base_version,document) VALUES(?,?,?,?)`,
			id(), taskID, remoteTask.Version, local); err != nil {
			return err
		}
	} else if remote != nil {
		if err := suppressSyncTriggers(ctx, tx, true); err != nil {
			return err
		}
		if err := writeRemoteTask(ctx, tx, remoteTask); err != nil {
			return err
		}
		if err := suppressSyncTriggers(ctx, tx, false); err != nil {
			return err
		}
	} else {
		if _, err := tx.ExecContext(ctx, `DELETE FROM task_order WHERE task_id=?`, taskID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM tasks WHERE id=?`, taskID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO sync_versions(task_id,version) VALUES(?,?)
		ON CONFLICT(task_id) DO UPDATE SET version=excluded.version`, taskID, remoteTask.Version); err != nil {
		return err
	}
	return tx.Commit()
}
