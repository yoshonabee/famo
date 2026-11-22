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
	ID              string `json:"id"`
	Name            string `json:"name"`
	Color           string `json:"color"`
	WorkspaceDir    string `json:"workspace_dir"`
	WorkspacePrompt string `json:"workspace_prompt"`
	Version         int    `json:"version"`
}

type ProjectInput struct {
	Name            string  `json:"name"`
	Color           *string `json:"color"`
	WorkspaceDir    *string `json:"workspace_dir"`
	WorkspacePrompt *string `json:"workspace_prompt"`
}

const defaultProjectColor = "#64748B"

var projectColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

var projectColors = [...]string{
	"#E06464", "#D98738", "#BD9229", "#4F9D69", "#32958E",
	"#4F87CC", "#8A6BCC", "#C369A0", defaultProjectColor,
}

func (s *Store) ListProjects(ctx context.Context) ([]Project, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,color,workspace_dir,workspace_prompt,version
		FROM projects ORDER BY position IS NULL,position,name,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Color, &p.WorkspaceDir, &p.WorkspacePrompt, &p.Version); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ReorderProjects saves the complete Project order without changing content versions.
func (s *Store) ReorderProjects(ctx context.Context, ids []string) error {
	if len(ids) < 2 {
		return fmt.Errorf("%w：排序至少需要兩個 Project", ErrInvalid)
	}
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if id == "" || seen[id] {
			return fmt.Errorf("%w：Project ID 不可空白或重複", ErrInvalid)
		}
		seen[id] = true
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	conflict := fmt.Errorf("%w：Project 列表已變更，請重新讀取後再排序", ErrConflict)
	var count int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM projects").Scan(&count); err != nil {
		return err
	}
	if count != len(ids) {
		return conflict
	}
	for position, id := range ids {
		result, err := tx.ExecContext(ctx, "UPDATE projects SET position=? WHERE id=?", position, id)
		if err != nil {
			return err
		}
		updated, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if updated == 0 {
			return conflict
		}
	}
	return tx.Commit()
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
	if in.WorkspaceDir != nil {
		dir, err := normalizeWorkspaceDir(*in.WorkspaceDir)
		if err != nil {
			return ProjectInput{}, err
		}
		in.WorkspaceDir = &dir
	}
	if in.WorkspacePrompt != nil {
		prompt, err := normalizeWorkspacePrompt(*in.WorkspacePrompt)
		if err != nil {
			return ProjectInput{}, err
		}
		in.WorkspacePrompt = &prompt
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
	if in.WorkspaceDir != nil {
		p.WorkspaceDir = *in.WorkspaceDir
	}
	if in.WorkspacePrompt != nil {
		p.WorkspacePrompt = *in.WorkspacePrompt
	}
	// Keep alphabetical order until the user explicitly sorts the Projects.
	if _, err := s.db.ExecContext(ctx, `INSERT INTO projects(id,name,color,workspace_dir,workspace_prompt,version,position)
		SELECT ?,?,?,?,?,?,MAX(position)+1 FROM projects`,
		p.ID, p.Name, p.Color, p.WorkspaceDir, p.WorkspacePrompt, p.Version); err != nil {
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
	err = s.db.QueryRowContext(ctx, `UPDATE projects SET name=?,color=COALESCE(?,color),
		workspace_dir=COALESCE(?,workspace_dir),workspace_prompt=COALESCE(?,workspace_prompt),version=version+1
		WHERE id=? AND version=? RETURNING color,workspace_dir,workspace_prompt,version`,
		in.Name, in.Color, in.WorkspaceDir, in.WorkspacePrompt, id, version).Scan(&p.Color, &p.WorkspaceDir, &p.WorkspacePrompt, &p.Version)
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
