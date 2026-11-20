package tasks

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/rand/v2"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

type Project struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Color   string `json:"color"`
	Version int    `json:"version"`
}

type ProjectInput struct {
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

const defaultProjectColor = "#64748B"

var projectColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

var projectColors = [...]string{
	"#E06464", "#D98738", "#BD9229", "#4F9D69", "#32958E",
	"#4F87CC", "#8A6BCC", "#C369A0", defaultProjectColor,
}

func (s *Store) ListProjects(ctx context.Context) ([]Project, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,name,color,version FROM projects ORDER BY name,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Color, &p.Version); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func validateProjectInput(in ProjectInput) (ProjectInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || utf8.RuneCountInString(in.Name) > 80 || strings.ContainsAny(in.Name, "\x00\r\n") {
		return ProjectInput{}, fmt.Errorf("%w：Project 名稱須為 1 到 80 個字元，且不可換行", ErrInvalid)
	}
	if in.Color != nil {
		color := strings.ToUpper(strings.TrimSpace(*in.Color))
		if !projectColorPattern.MatchString(color) {
			return ProjectInput{}, fmt.Errorf("%w：Project 顏色須為 #RRGGBB 色碼", ErrInvalid)
		}
		in.Color = &color
	}
	return in, nil
}

func projectWriteError(err error) error {
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) && sqliteErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE {
		return fmt.Errorf("%w：已有同名的 Project", ErrInvalid)
	}
	return err
}

func (s *Store) CreateProject(ctx context.Context, in ProjectInput) (Project, error) {
	in, err := validateProjectInput(in)
	if err != nil {
		return Project{}, err
	}
	p := Project{ID: id(), Name: in.Name, Version: 1}
	if in.Color == nil {
		p.Color = projectColors[rand.IntN(len(projectColors))]
	} else {
		p.Color = *in.Color
	}
	if _, err := s.db.ExecContext(ctx, "INSERT INTO projects(id,name,color,version) VALUES(?,?,?,?)", p.ID, p.Name, p.Color, p.Version); err != nil {
		return Project{}, projectWriteError(err)
	}
	return p, nil
}

func (s *Store) UpdateProject(ctx context.Context, id string, in ProjectInput, version int) (Project, error) {
	in, err := validateProjectInput(in)
	if err != nil {
		return Project{}, err
	}
	p := Project{ID: id, Name: in.Name}
	err = s.db.QueryRowContext(ctx, `UPDATE projects SET name=?,color=COALESCE(?,color),version=version+1
		WHERE id=? AND version=? RETURNING color,version`, in.Name, in.Color, id, version).Scan(&p.Color, &p.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return Project{}, projectVersionError(ctx, s.db, id)
	}
	if err != nil {
		return Project{}, projectWriteError(err)
	}
	return p, nil
}

func (s *Store) DeleteProject(ctx context.Context, id string, version int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	err = tx.QueryRowContext(ctx, "DELETE FROM projects WHERE id=? AND version=? RETURNING id", id, version).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return projectVersionError(ctx, tx, id)
	}
	if err != nil {
		return err
	}
	// Include recently deleted tasks so restoring one cannot resurrect a removed Project assignment.
	if _, err := tx.ExecContext(ctx, `
		UPDATE tasks
		SET version=version+1,
		    document=json_set(json_remove(document,'$.project_id'),
		        '$.version',version+1,'$.updated_at',?)
		WHERE json_extract(document,'$.project_id')=?`,
		time.Now().UTC().Format(time.RFC3339Nano), id); err != nil {
		return err
	}
	return tx.Commit()
}

func projectVersionError(ctx context.Context, db schemaReader, id string) error {
	var exists bool
	if err := db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)", id).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("%w：找不到 Project", ErrNotFound)
	}
	return fmt.Errorf("%w：Project 已被更新", ErrConflict)
}

func validateProject(ctx context.Context, db schemaReader, id string) error {
	if id == "" {
		return nil
	}
	var exists bool
	if err := db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)", id).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("%w：找不到指定的 Project", ErrInvalid)
	}
	return nil
}
