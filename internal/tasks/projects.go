package tasks

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

type Project struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version int    `json:"version"`
}

func (s *Store) ListProjects(ctx context.Context) ([]Project, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,name,version FROM projects ORDER BY name,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Version); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func projectName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 80 || strings.ContainsAny(name, "\x00\r\n") {
		return "", fmt.Errorf("%w：Project 名稱須為 1 到 80 個字元，且不可換行", ErrInvalid)
	}
	return name, nil
}

func projectWriteError(err error) error {
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) && sqliteErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE {
		return fmt.Errorf("%w：已有同名的 Project", ErrInvalid)
	}
	return err
}

func (s *Store) CreateProject(ctx context.Context, name string) (Project, error) {
	name, err := projectName(name)
	if err != nil {
		return Project{}, err
	}
	p := Project{ID: id(), Name: name, Version: 1}
	if _, err := s.db.ExecContext(ctx, "INSERT INTO projects(id,name,version) VALUES(?,?,?)", p.ID, p.Name, p.Version); err != nil {
		return Project{}, projectWriteError(err)
	}
	return p, nil
}

func (s *Store) RenameProject(ctx context.Context, id, name string, version int) (Project, error) {
	name, err := projectName(name)
	if err != nil {
		return Project{}, err
	}
	var newVersion int
	err = s.db.QueryRowContext(ctx, "UPDATE projects SET name=?,version=version+1 WHERE id=? AND version=? RETURNING version", name, id, version).Scan(&newVersion)
	if errors.Is(err, sql.ErrNoRows) {
		var exists bool
		if err := s.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)", id).Scan(&exists); err != nil {
			return Project{}, err
		}
		if !exists {
			return Project{}, fmt.Errorf("%w：找不到 Project", ErrNotFound)
		}
		return Project{}, fmt.Errorf("%w：Project 已被更新", ErrConflict)
	}
	if err != nil {
		return Project{}, projectWriteError(err)
	}
	return Project{ID: id, Name: name, Version: newVersion}, nil
}

func (s *Store) validateProject(ctx context.Context, id string) error {
	if id == "" {
		return nil
	}
	var exists bool
	if err := s.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)", id).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("%w：找不到指定的 Project", ErrInvalid)
	}
	return nil
}
