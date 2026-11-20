package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
	mu sync.Mutex
}

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
	return &Store{db: db}, nil
}
func (s *Store) Close() error { return s.db.Close() }
func (s *Store) List(ctx context.Context) ([]Task, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.document FROM tasks t JOIN task_order o ON o.task_id=t.id WHERE t.deleted_at IS NULL ORDER BY t.completed_at IS NOT NULL,o.position,t.id`)
	if err != nil {
		return nil, err
	}
	return readTasks(rows)
}

func readTasks(rows *sql.Rows) ([]Task, error) {
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
	return readTask(s.db.QueryRowContext(ctx, `SELECT document FROM tasks WHERE id=? AND deleted_at IS NULL`, id))
}

func readTask(row *sql.Row) (Task, error) {
	var raw string
	err := row.Scan(&raw)
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
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := newTask(in, time.Now().UTC())
	if err != nil {
		return Task{}, fmt.Errorf("%w：%v", ErrInvalid, err)
	}
	if err := s.validateProject(ctx, t.ProjectID); err != nil {
		return Task{}, err
	}
	raw, err := json.Marshal(t)
	if err != nil {
		return Task{}, err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO tasks(id,version,document) VALUES(?,?,?)`, t.ID, t.Version, string(raw))
	return t, err
}
func (s *Store) Act(ctx context.Context, id string, a Action) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
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
	if a.Op == "update" && a.ProjectID != nil {
		if err := s.validateProject(ctx, t.ProjectID); err != nil {
			return Task{}, err
		}
	}
	raw, err := json.Marshal(t)
	if err != nil {
		return Task{}, err
	}
	result, err := s.db.ExecContext(ctx, `UPDATE tasks SET completed_at=?,deleted_at=?,version=?,document=? WHERE id=? AND version=? AND deleted_at IS NULL`, t.CompletedAt, t.DeletedAt, t.Version, string(raw), id, a.Version)
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
