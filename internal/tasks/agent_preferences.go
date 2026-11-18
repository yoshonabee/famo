package tasks

import (
	"context"
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
	if workspace.Dir != "" {
		if !filepath.IsAbs(workspace.Dir) {
			return agent.Workspace{}, fmt.Errorf("%w：工作區請使用完整路徑", ErrInvalid)
		}
		workspace.Dir = filepath.Clean(workspace.Dir)
		info, err := os.Stat(workspace.Dir)
		if err != nil || !info.IsDir() {
			return agent.Workspace{}, fmt.Errorf("%w：找不到工作區資料夾或無法存取", ErrInvalid)
		}
	}
	workspace.Prompt = strings.TrimSpace(workspace.Prompt)
	if utf8.RuneCountInString(workspace.Prompt) > 2000 {
		return agent.Workspace{}, fmt.Errorf("%w：工作區指引最多 2000 字", ErrInvalid)
	}
	_, err := s.db.ExecContext(ctx, `UPDATE agent_preferences SET workspace_dir=?, workspace_prompt=? WHERE id=1`, workspace.Dir, workspace.Prompt)
	return workspace, err
}
