package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"famo/internal/agent"
)

func (s *Store) AgentAPIEnabled(ctx context.Context) (bool, error) {
	var enabled bool
	err := s.db.QueryRowContext(ctx, `SELECT api_enabled FROM agent_preferences WHERE id=1`).Scan(&enabled)
	return enabled, err
}

func (s *Store) SetAgentAPIEnabled(ctx context.Context, enabled bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE agent_preferences SET api_enabled=? WHERE id=1`, enabled)
	return err
}

func (s *Store) Workspace(ctx context.Context) (agent.Workspace, error) {
	var workspace agent.Workspace
	err := s.db.QueryRowContext(ctx, `SELECT workspace_dir, workspace_prompt FROM agent_preferences WHERE id=1`).Scan(&workspace.Dir, &workspace.Prompt)
	return workspace, err
}

func (s *Store) SaveWorkspace(ctx context.Context, workspace agent.Workspace) (agent.Workspace, error) {
	var err error
	workspace.Dir, err = normalizeWorkspaceDir(workspace.Dir)
	if err != nil {
		return agent.Workspace{}, err
	}
	workspace.Prompt, err = normalizeWorkspacePrompt(workspace.Prompt)
	if err != nil {
		return agent.Workspace{}, err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE agent_preferences SET workspace_dir=?, workspace_prompt=? WHERE id=1`, workspace.Dir, workspace.Prompt)
	return workspace, err
}

func normalizeWorkspaceDir(dir string) (string, error) {
	if dir == "" {
		return "", nil
	}
	if !filepath.IsAbs(dir) {
		return "", fmt.Errorf("%w：工作區請使用完整路徑", ErrInvalid)
	}
	dir = filepath.Clean(dir)
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("%w：找不到工作區資料夾或無法存取", ErrInvalid)
	}
	return dir, nil
}

func normalizeWorkspacePrompt(prompt string) (string, error) {
	prompt = strings.TrimSpace(prompt)
	if utf8.RuneCountInString(prompt) > 2000 {
		return "", fmt.Errorf("%w：工作區指引最多 2000 字", ErrInvalid)
	}
	return prompt, nil
}

type TaskContext struct {
	Task
	Workspace agent.Workspace `json:"workspace"`
}

func (s *Store) GetContext(ctx context.Context, id string) (TaskContext, error) {
	var current TaskContext
	var document string
	err := s.db.QueryRowContext(ctx, `
		SELECT t.document, COALESCE(p.workspace_dir,a.workspace_dir), COALESCE(p.workspace_prompt,a.workspace_prompt)
		FROM tasks t
		LEFT JOIN projects p ON p.id=json_extract(t.document,'$.project_id')
		JOIN agent_preferences a ON a.id=1
		WHERE t.id=? AND t.deleted_at IS NULL`, id).Scan(&document, &current.Workspace.Dir, &current.Workspace.Prompt)
	if errors.Is(err, sql.ErrNoRows) {
		return TaskContext{}, ErrNotFound
	}
	if err != nil {
		return TaskContext{}, err
	}
	err = json.Unmarshal([]byte(document), &current.Task)
	return current, err
}
