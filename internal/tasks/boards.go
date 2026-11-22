package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

const defaultBoardIcon = "layout-grid"

var boardIcons = []string{
	defaultBoardIcon, "briefcase", "house", "code", "shopping-cart", "music",
	"book-open", "heart", "dumbbell", "target", "calendar-days", "star",
}

type Board struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Icon       string   `json:"icon"`
	ProjectIDs []string `json:"project_ids"`
	Version    int      `json:"version"`
}

type BoardInput struct {
	Name       string   `json:"name"`
	Icon       *string  `json:"icon"`
	ProjectIDs []string `json:"project_ids"`
}

func (s *Store) ListBoards(ctx context.Context) ([]Board, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT b.id,b.name,b.icon,b.version,(
			SELECT json_group_array(project_id ORDER BY project_id)
			FROM board_projects WHERE board_id=b.id
		)
		FROM boards AS b ORDER BY b.name,b.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Board{}
	for rows.Next() {
		var board Board
		var projectIDs []byte
		if err := rows.Scan(&board.ID, &board.Name, &board.Icon, &board.Version, &projectIDs); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(projectIDs, &board.ProjectIDs); err != nil {
			return nil, err
		}
		out = append(out, board)
	}
	return out, rows.Err()
}

func validateBoardInput(in BoardInput) (BoardInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || utf8.RuneCountInString(in.Name) > 80 || strings.ContainsAny(in.Name, "\x00\r\n") {
		return BoardInput{}, fmt.Errorf("%w：Board 名稱須為 1 到 80 個字元，且不可換行", ErrInvalid)
	}
	if in.Icon != nil && !slices.Contains(boardIcons, *in.Icon) {
		return BoardInput{}, fmt.Errorf("%w：請選擇支援的 Board 圖示", ErrInvalid)
	}
	in.ProjectIDs = append([]string{}, in.ProjectIDs...)
	slices.Sort(in.ProjectIDs)
	for i, projectID := range in.ProjectIDs {
		if projectID == "" || (i > 0 && projectID == in.ProjectIDs[i-1]) {
			return BoardInput{}, fmt.Errorf("%w：Project ID 不可空白或重複", ErrInvalid)
		}
	}
	return in, nil
}

func boardWriteError(err error) error {
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) && sqliteErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE {
		return fmt.Errorf("%w：已有同名的 Board", ErrInvalid)
	}
	return err
}

func (s *Store) CreateBoard(ctx context.Context, in BoardInput) (Board, error) {
	in, err := validateBoardInput(in)
	if err != nil {
		return Board{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Board{}, err
	}
	defer tx.Rollback()

	board := Board{ID: id(), Name: in.Name, Icon: defaultBoardIcon, ProjectIDs: in.ProjectIDs, Version: 1}
	if in.Icon != nil {
		board.Icon = *in.Icon
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO boards(id,name,icon,version) VALUES(?,?,?,?)", board.ID, board.Name, board.Icon, board.Version); err != nil {
		return Board{}, boardWriteError(err)
	}
	if err := insertBoardProjects(ctx, tx, board); err != nil {
		return Board{}, err
	}
	if err := tx.Commit(); err != nil {
		return Board{}, err
	}
	return board, nil
}

func (s *Store) UpdateBoard(ctx context.Context, id string, in BoardInput, version int) (Board, error) {
	in, err := validateBoardInput(in)
	if err != nil {
		return Board{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Board{}, err
	}
	defer tx.Rollback()

	board := Board{ID: id, Name: in.Name, ProjectIDs: in.ProjectIDs}
	err = tx.QueryRowContext(ctx, `UPDATE boards SET name=?,icon=COALESCE(?,icon),version=version+1
		WHERE id=? AND version=? RETURNING icon,version`, board.Name, in.Icon, id, version).Scan(&board.Icon, &board.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return Board{}, boardVersionError(ctx, tx, id)
	}
	if err != nil {
		return Board{}, boardWriteError(err)
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM board_projects WHERE board_id=?", id); err != nil {
		return Board{}, err
	}
	if err := insertBoardProjects(ctx, tx, board); err != nil {
		return Board{}, err
	}
	if err := tx.Commit(); err != nil {
		return Board{}, err
	}
	return board, nil
}

func (s *Store) DeleteBoard(ctx context.Context, id string, version int) error {
	err := s.db.QueryRowContext(ctx, "DELETE FROM boards WHERE id=? AND version=? RETURNING id", id, version).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return boardVersionError(ctx, s.db, id)
	}
	return err
}

func boardVersionError(ctx context.Context, db schemaReader, id string) error {
	var exists bool
	if err := db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM boards WHERE id=?)", id).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("%w：找不到 Board", ErrNotFound)
	}
	return fmt.Errorf("%w：Board 已被更新", ErrConflict)
}

func insertBoardProjects(ctx context.Context, tx *sql.Tx, board Board) error {
	projectIDs, err := json.Marshal(board.ProjectIDs)
	if err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO board_projects(board_id,project_id)
		SELECT ?,p.id FROM json_each(?) AS selected JOIN projects AS p ON p.id=selected.value`,
		board.ID, string(projectIDs))
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != int64(len(board.ProjectIDs)) {
		return fmt.Errorf("%w：找不到指定的 Project", ErrInvalid)
	}
	return nil
}
