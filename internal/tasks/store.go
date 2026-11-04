package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct{ db *sql.DB }

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err = db.Exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;`); err != nil {
		db.Close()
		return nil, err
	}
	if err = migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db}, nil
}
func migrate(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var version int
	if err = tx.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	if version > 3 {
		return fmt.Errorf("資料庫版本 %d 高於此程式支援版本", version)
	}
	_, err = tx.Exec(`
 CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, type TEXT NOT NULL, stage TEXT NOT NULL,
 waiting_reason TEXT NOT NULL, review_at TEXT, completed_at TEXT,
 priority INTEGER NOT NULL, version INTEGER NOT NULL,
 steps JSON NOT NULL, links JSON NOT NULL, metadata JSON NOT NULL,
 document JSON NOT NULL
 );
 CREATE INDEX IF NOT EXISTS tasks_home ON tasks(completed_at, priority, review_at);
 CREATE TABLE IF NOT EXISTS task_order(task_id TEXT PRIMARY KEY REFERENCES tasks(id), position INTEGER NOT NULL);
 INSERT INTO task_order(task_id,position)
 SELECT id,(SELECT COALESCE(MAX(position),0) FROM task_order)+ROW_NUMBER() OVER(ORDER BY priority DESC,json_extract(document,'$.created_at'),id)
 FROM tasks WHERE id NOT IN(SELECT task_id FROM task_order);
 CREATE INDEX IF NOT EXISTS task_order_position ON task_order(position);
 CREATE TRIGGER IF NOT EXISTS tasks_order_insert AFTER INSERT ON tasks BEGIN
 INSERT INTO task_order(task_id,position) VALUES(NEW.id,(SELECT COALESCE(MAX(position),0)+1 FROM task_order));
 END;
 `)
	if err != nil {
		return err
	}
	if version < 3 {
		if _, err = tx.Exec(`ALTER TABLE tasks ADD COLUMN deleted_at TEXT;`); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(`PRAGMA user_version=3;`); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) Close() error { return s.db.Close() }
func (s *Store) List(ctx context.Context) ([]Task, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.document FROM tasks t JOIN task_order o ON o.task_id=t.id WHERE t.deleted_at IS NULL ORDER BY t.completed_at IS NOT NULL,o.position,t.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		var raw string
		var t Task
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(raw), &t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Reorder replaces only the selected tasks' slots. Other sections and filtered-out
// tasks retain their positions. Ordering is independent of task content versions.
func (s *Store) Reorder(ctx context.Context, ids []string) error {
	if len(ids) < 2 {
		return fmt.Errorf("%w：排序至少需要兩件任務", ErrInvalid)
	}
	wanted := make(map[string]bool, len(ids))
	for _, id := range ids {
		if id == "" || wanted[id] {
			return fmt.Errorf("%w：任務 ID 不可空白或重複", ErrInvalid)
		}
		wanted[id] = true
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT t.id,o.position FROM tasks t JOIN task_order o ON o.task_id=t.id WHERE t.completed_at IS NULL AND t.deleted_at IS NULL ORDER BY o.position`)
	if err != nil {
		return err
	}
	positions := []int64{}
	for rows.Next() {
		var id string
		var position int64
		if err = rows.Scan(&id, &position); err != nil {
			rows.Close()
			return err
		}
		if wanted[id] {
			positions = append(positions, position)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if len(positions) != len(ids) {
		return fmt.Errorf("%w：排序包含不存在或已完成的任務，請重新讀取", ErrInvalid)
	}
	for i, id := range ids {
		if _, err = tx.ExecContext(ctx, `UPDATE task_order SET position=? WHERE task_id=?`, positions[i], id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *Store) Get(ctx context.Context, id string) (Task, error) {
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT document FROM tasks WHERE id=? AND deleted_at IS NULL`, id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return Task{}, ErrNotFound
	}
	if err != nil {
		return Task{}, err
	}
	var t Task
	err = json.Unmarshal([]byte(raw), &t)
	return t, err
}
func (s *Store) Create(ctx context.Context, in CreateInput) (Task, error) {
	t, err := newTask(in, time.Now().UTC())
	if err != nil {
		return Task{}, fmt.Errorf("%w：%v", ErrInvalid, err)
	}
	raw, err := json.Marshal(t)
	if err != nil {
		return Task{}, err
	}
	steps, _ := json.Marshal(t.Steps)
	links, _ := json.Marshal(t.Links)
	metadata, _ := json.Marshal(t.Metadata)
	_, err = s.db.ExecContext(ctx, `INSERT INTO tasks(id,type,stage,waiting_reason,review_at,completed_at,priority,version,steps,links,metadata,document) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, t.ID, t.Type, t.Stage, t.WaitingReason, t.ReviewAt, t.CompletedAt, t.Priority, t.Version, string(steps), string(links), string(metadata), string(raw))
	return t, err
}
func (s *Store) Act(ctx context.Context, id string, a Action) (Task, error) {
	t, err := s.Get(ctx, id)
	if err != nil {
		return Task{}, err
	}
	if a.Version != t.Version {
		return Task{}, ErrConflict
	}
	if err = apply(&t, a, time.Now().UTC()); err != nil {
		return Task{}, fmt.Errorf("%w：%v", ErrInvalid, err)
	}
	raw, err := json.Marshal(t)
	if err != nil {
		return Task{}, err
	}
	steps, _ := json.Marshal(t.Steps)
	links, _ := json.Marshal(t.Links)
	metadata, _ := json.Marshal(t.Metadata)
	result, err := s.db.ExecContext(ctx, `UPDATE tasks SET type=?,stage=?,waiting_reason=?,review_at=?,completed_at=?,deleted_at=?,priority=?,version=?,steps=?,links=?,metadata=?,document=? WHERE id=? AND version=? AND deleted_at IS NULL`, t.Type, t.Stage, t.WaitingReason, t.ReviewAt, t.CompletedAt, t.DeletedAt, t.Priority, t.Version, string(steps), string(links), string(metadata), string(raw), id, a.Version)
	if err != nil {
		return Task{}, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return Task{}, err
	}
	if n != 1 {
		return Task{}, ErrConflict
	}
	return t, nil
}
