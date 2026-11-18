package agentcli

import (
	"bytes"
	"context"
	"encoding/json"
	"io/fs"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"famo/internal/agent"
	"famo/internal/server"
	"famo/internal/tasks"
)

func TestTaskCommandsUseWorkspaceAndVersions(t *testing.T) {
	dir := t.TempDir()
	db, err := tasks.Open(filepath.Join(dir, "famo.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	workspace := agent.Workspace{Dir: dir, Prompt: "Read docs first"}
	if _, err := db.SaveWorkspace(t.Context(), workspace); err != nil {
		t.Fatal(err)
	}
	api := httptest.NewServer(server.New(db, nil))
	t.Cleanup(api.Close)
	call := func(code int, args ...string) string {
		t.Helper()
		var stdout, stderr bytes.Buffer
		if got := Run(context.Background(), append([]string{"--url", api.URL}, args...), &stdout, &stderr); got != code {
			t.Fatalf("%v returned %d, wanted %d: %s", args, got, code, &stderr)
		}
		if code != 0 {
			return stderr.String()
		}
		return stdout.String()
	}
	read := func(payload string, dest any) {
		t.Helper()
		if err := json.Unmarshal([]byte(payload), dest); err != nil {
			t.Fatalf("invalid output: %v: %s", err, payload)
		}
	}

	const date = "2026-11-18"
	var created task
	read(call(0, "add", "--title", "調查登入逾時", "--date", date), &created)
	call(0, "add", "--title", "undated")
	var daily struct {
		Workspace agent.Workspace
		Tasks     []task
	}
	read(call(0, "today", "--date", date), &daily)
	if daily.Workspace != workspace || len(daily.Tasks) != 1 || daily.Tasks[0].ID != created.ID {
		t.Fatalf("unexpected today result: %+v", daily)
	}

	var updated task
	read(call(0, "update", created.ID, "--version", "1", "--description", "已重現", "--link", "https://example.com/report"), &updated)
	if updated.Version != 2 || updated.Description != "已重現" || len(updated.Links) != 1 {
		t.Fatalf("unexpected update: %+v", updated)
	}
	failure := call(3, "complete", created.ID, "--version", "1")
	if !strings.Contains(failure, `"status":409`) {
		t.Fatalf("missing conflict status: %s", failure)
	}

	var context struct {
		Task      task
		Workspace agent.Workspace
	}
	read(call(0, "context", created.ID), &context)
	if context.Workspace != workspace || context.Task.Version != 2 || context.Task.CompletedAt != nil {
		t.Fatalf("unexpected task context: %+v", context)
	}
	call(0, "complete", created.ID, "--version", "2")
	read(call(0, "today", "--date", date), &daily)
	if len(daily.Tasks) != 0 {
		t.Fatalf("completed task still in today: %+v", daily)
	}
}

func TestSkillInstallationWorksWithoutAPI(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "custom skills")
	path := filepath.Join(dir, "famo", "SKILL.md")
	var stdout, stderr bytes.Buffer
	if code := Run(t.Context(), []string{"skill", "install", "--dir", dir}, &stdout, &stderr); code != 0 {
		t.Fatalf("install exited %d: %s", code, &stderr)
	}
	got, err := fs.ReadFile(os.DirFS(dir), "famo/SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != skill {
		t.Fatalf("installed skill at %s differs from embedded copy", path)
	}
}
