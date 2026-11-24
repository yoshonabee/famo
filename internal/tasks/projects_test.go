package tasks

import (
	"database/sql"
	"errors"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"famo/internal/agent"
)

func TestDeleteProjectPreservesTasksAndClearsBoardSelections(t *testing.T) {
	store := openTest(t)
	ctx := t.Context()
	project, err := store.CreateProject(ctx, ProjectInput{Name: "Work"})
	if err != nil {
		t.Fatal(err)
	}
	board, err := store.CreateBoard(ctx, BoardInput{Name: "Work", ProjectIDs: []string{project.ID}})
	if err != nil {
		t.Fatal(err)
	}
	assigned := make([]Task, 0, 3)
	for i, action := range []string{"", "complete_task", "delete_item"} {
		task, err := store.Create(ctx, CreateInput{
			Title: "Keep this task", ProjectID: project.ID, ScheduledDate: "2026-11-20",
			Description: "Keep this context", Links: []Link{{URL: "https://example.com/context"}},
		})
		if err != nil {
			t.Fatal(err)
		}
		if i > 0 {
			task, err = store.Act(ctx, task.ID, Action{Op: action, Version: task.Version})
			if err != nil {
				t.Fatal(err)
			}
		}
		assigned = append(assigned, task)
	}

	if err := store.DeleteProject(ctx, project.ID, project.Version+1); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale deletion: %v", err)
	}
	before, err := store.Get(ctx, assigned[0].ID)
	if err != nil || !reflect.DeepEqual(before, assigned[0]) {
		t.Fatalf("stale deletion changed task: %+v, %v", before, err)
	}
	if err := store.DeleteProject(ctx, project.ID, project.Version); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteProject(ctx, project.ID, project.Version); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleting a missing Project: %v", err)
	}
	for _, want := range assigned {
		got, err := readTask(store.db.QueryRowContext(ctx, "SELECT document FROM tasks WHERE id=?", want.ID))
		if err != nil {
			t.Fatal(err)
		}
		if got.UpdatedAt.Before(want.UpdatedAt) {
			t.Fatalf("task update time moved backward: %+v", got)
		}
		want.UpdatedAt = got.UpdatedAt
		want.ProjectID = ""
		want.Version++
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("project deletion changed unexpected task fields: %+v; want %+v", got, want)
		}
	}
	deleted := assigned[2]
	restored, err := store.Restore(ctx, deleted.ID, deleted.Version+1)
	if err != nil || restored.ProjectID != "" || restored.DeletedAt != nil {
		t.Fatalf("restore after Project deletion: %+v, %v", restored, err)
	}
	boards, err := store.ListBoards(ctx)
	board.ProjectIDs = []string{}
	board.Version++
	if err != nil || !reflect.DeepEqual(boards, []Board{board}) {
		t.Fatalf("Board after Project deletion: %+v, %v", boards, err)
	}
}

func TestReorderProjectsPersistsAndPreservesVersions(t *testing.T) {
	ctx := t.Context()
	path := filepath.Join(t.TempDir(), "project-order.db")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	create := func(name string) Project {
		t.Helper()
		project, err := store.CreateProject(ctx, ProjectInput{Name: name})
		if err != nil {
			t.Fatal(err)
		}
		return project
	}
	check := func(want ...Project) {
		t.Helper()
		got, err := store.ListProjects(ctx)
		if err != nil || !slices.Equal(got, want) {
			t.Fatalf("Project order: %+v, %v; want %+v", got, err, want)
		}
	}
	b, c, a := create("Beta"), create("Gamma"), create("Alpha")
	check(a, b, c)
	if err := store.ReorderProjects(ctx, []string{c.ID, a.ID, b.ID}); err != nil {
		t.Fatal(err)
	}
	check(c, a, b)
	if err := store.ReorderProjects(ctx, []string{b.ID, a.ID, "missing"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale Project order: %v", err)
	}
	if err := store.ReorderProjects(ctx, []string{a.ID, b.ID, a.ID}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("duplicate Project ID: %v", err)
	}
	check(c, a, b)
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	d := create("Aardvark")
	check(c, a, b, d)
	if err := store.ReorderProjects(ctx, []string{c.ID, a.ID, b.ID}); !errors.Is(err, ErrConflict) {
		t.Fatalf("order missing new Project: %v", err)
	}
	check(c, a, b, d)
}

func TestProjectAssignmentsAndVersionChecks(t *testing.T) {
	path := filepath.Join(t.TempDir(), "famo.db")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	ctx := t.Context()
	work, err := store.CreateProject(ctx, ProjectInput{Name: " 工作 "})
	if err != nil || work.Name != "工作" || work.Version != 1 || !slices.Contains(projectColors[:], work.Color) {
		t.Fatalf("create project: %+v, %v", work, err)
	}
	life, err := store.CreateProject(ctx, ProjectInput{Name: "生活", Color: ptr("#aabbcc")})
	if err != nil || life.Color != "#AABBCC" {
		t.Fatalf("create with a custom color: %+v, %v", life, err)
	}
	for _, name := range []string{"  ", "工作", "第一行\n第二行"} {
		if _, err := store.CreateProject(ctx, ProjectInput{Name: name}); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid project name %q: %v", name, err)
		}
	}
	if _, err := store.UpdateProject(ctx, life.ID, ProjectInput{Name: work.Name}, life.Version); !errors.Is(err, ErrInvalid) {
		t.Fatalf("allowed duplicate name on rename: %v", err)
	}
	color := work.Color
	work, err = store.UpdateProject(ctx, work.ID, ProjectInput{Name: "產品工作"}, work.Version)
	if err != nil || work.Name != "產品工作" || work.Color != color || work.Version != 2 {
		t.Fatalf("rename project: %+v, %v", work, err)
	}
	if _, err := store.UpdateProject(ctx, work.ID, ProjectInput{Name: work.Name, Color: ptr("transparent")}, work.Version); !errors.Is(err, ErrInvalid) {
		t.Fatalf("allowed invalid color: %v", err)
	}
	if _, err := store.UpdateProject(ctx, work.ID, ProjectInput{Name: "舊版本", Color: ptr("#123456")}, 1); !errors.Is(err, ErrConflict) {
		t.Fatalf("allowed stale project rename: %v", err)
	}
	if _, err := store.UpdateProject(ctx, "missing", ProjectInput{Name: "不存在"}, 1); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown project rename: %v", err)
	}
	projects, err := store.ListProjects(ctx)
	if err != nil || !reflect.DeepEqual(projects, []Project{life, work}) {
		t.Fatalf("list projects: %+v, %v", projects, err)
	}

	if _, err := store.Create(ctx, CreateInput{Title: "無效分類", ProjectID: "missing"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("allowed create with an unknown project: %v", err)
	}
	first, err := store.Create(ctx, CreateInput{
		Title: "整理文件", ProjectID: work.ID, ScheduledDate: "2026-11-20",
	})
	if err != nil || first.ProjectID != work.ID {
		t.Fatalf("create task in project: %+v, %v", first, err)
	}
	if _, err := store.Act(ctx, first.ID, Action{
		Op: "update", Version: first.Version, ProjectID: ptr("missing"), ScheduledDate: ptr("2026-11-21"),
	}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("allowed reassignment to an unknown project: %v", err)
	}
	task, err := store.Get(ctx, first.ID)
	if err != nil || !reflect.DeepEqual(task, first) {
		t.Fatalf("invalid write changed task data: %+v, %v", task, err)
	}
	task, err = store.Act(ctx, first.ID, Action{Op: "update", Version: 1, ProjectID: &life.ID})
	if err != nil || task.ProjectID != life.ID || task.ScheduledDate != first.ScheduledDate || task.Version != 2 {
		t.Fatalf("move task: %+v, %v", task, err)
	}
	if _, err := store.Act(ctx, task.ID, Action{Op: "update", Version: 1, ProjectID: ptr("")}); !errors.Is(err, ErrConflict) {
		t.Fatalf("allowed stale reassignment: %v", err)
	}
	task, err = store.Act(ctx, task.ID, Action{Op: "complete_task", Version: task.Version})
	if err != nil || task.ProjectID != life.ID || task.CompletedAt == nil {
		t.Fatalf("completion changed project: %+v, %v", task, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	persisted, err := store.Get(ctx, task.ID)
	if err != nil || !reflect.DeepEqual(persisted, task) {
		t.Fatalf("reopen lost project assignment: %+v, %v", persisted, err)
	}
	task, err = store.Act(ctx, task.ID, Action{Op: "update", Version: task.Version, ProjectID: ptr("")})
	if err != nil || task.ProjectID != "" || task.CompletedAt == nil || task.ScheduledDate != first.ScheduledDate {
		t.Fatalf("clear project: %+v, %v", task, err)
	}
}

func TestMigrateV6ProjectSchema(t *testing.T) {
	for _, mode := range []string{"open", "cleanup"} {
		t.Run(mode, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "v6.db")
			db, err := sql.Open("sqlite", path)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			const original = `{"id":"current","title":"目前任務","description":"保留備註","scheduled_date":"2026-11-20","version":4,"links":[]}`
			execSQL(t, db, activeSchema+orderNewTasks+`
PRAGMA user_version=6;
CREATE TABLE famo_legacy_tasks (id TEXT PRIMARY KEY);
INSERT INTO famo_legacy_tasks(id) VALUES('archived');
UPDATE agent_preferences SET workspace_dir='/workspace' WHERE id=1;`)
			execSQL(t, db, "INSERT INTO tasks(id,version,document) VALUES('current',4,?)", original)
			execSQL(t, db, "UPDATE task_order SET position=42 WHERE task_id='current'")
			if err := db.Close(); err != nil {
				t.Fatal(err)
			}

			ctx := t.Context()
			preview, err := PreviewCleanup(ctx, path)
			if err != nil || preview.SchemaVersion != 6 || preview.LegacyTasks != 1 ||
				!reflect.DeepEqual(preview.LegacyTables, []string{"famo_legacy_tasks"}) {
				t.Fatalf("cleanup preview misidentified v6 schema: %+v, %v", preview, err)
			}
			if mode == "cleanup" {
				report, err := ApplyCleanup(ctx, path, path+".backup")
				if err != nil || report.SchemaVersion != schemaVersion || !report.Applied {
					t.Fatalf("v6 cleanup: %+v, %v", report, err)
				}
			}

			store, err := Open(path)
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			version, err := databaseVersion(ctx, store.db)
			if err != nil || version != schemaVersion {
				t.Fatalf("schema version: %d, %v", version, err)
			}
			var raw string
			var position int
			err = store.db.QueryRowContext(ctx, `SELECT t.document,o.position FROM tasks t JOIN task_order o ON t.id=o.task_id WHERE t.id='current'`).Scan(&raw, &position)
			if err != nil || raw != original || position != 42 {
				t.Fatalf("changed v6 active task: %s, %d, %v", raw, position, err)
			}
			archived, err := tableExists(ctx, store.db, "famo_legacy_tasks")
			if err != nil || archived != (mode == "open") {
				t.Fatalf("unexpected archive state: %t, %v", archived, err)
			}
			if workspace, err := store.Workspace(ctx); err != nil || workspace.Dir != "/workspace" {
				t.Fatalf("workspace changed: %+v, %v", workspace, err)
			}
			project, err := store.CreateProject(ctx, ProjectInput{Name: "工作"})
			if err != nil {
				t.Fatal(err)
			}
			task, err := store.Act(ctx, "current", Action{Op: "update", Version: 4, ProjectID: &project.ID})
			if err != nil || task.ProjectID != project.ID || task.Description != "保留備註" || task.ScheduledDate != "2026-11-20" {
				t.Fatalf("assign existing task: %+v, %v", task, err)
			}
		})
	}
}

func TestAddColorAndWorkspaceToEarlierV7Projects(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v7.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	execSQL(t, db, activeSchema+orderNewTasks+`
CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, version INTEGER NOT NULL);
INSERT INTO projects(id,name,version) VALUES('existing','Existing project',3);
INSERT INTO tasks(id,version,document) VALUES('task',1,'{"id":"task","title":"Existing task","project_id":"existing","version":1}');
PRAGMA user_version=7;`)
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	ctx := t.Context()
	projects, err := store.ListProjects(ctx)
	want := Project{ID: "existing", Name: "Existing project", Color: defaultProjectColor, Version: 3}
	if err != nil || !slices.Equal(projects, []Project{want}) {
		t.Fatalf("migrated projects: %+v, %v", projects, err)
	}
	task, err := store.Get(ctx, "task")
	if err != nil || task.ProjectID != want.ID {
		t.Fatalf("lost assignment: %+v, %v", task, err)
	}
	dir := t.TempDir()
	saved, err := store.UpdateProject(ctx, want.ID, ProjectInput{
		Name: want.Name, Color: ptr("#123456"), WorkspaceDir: ptr(dir + string(filepath.Separator) + "."), WorkspacePrompt: ptr(" Read the README. "),
	}, want.Version)
	if err != nil || saved.Color != "#123456" || saved.Version != want.Version+1 || saved.WorkspaceDir != dir || saved.WorkspacePrompt != "Read the README." {
		t.Fatalf("update color and workspace: %+v, %v", saved, err)
	}
	board, err := store.CreateBoard(ctx, BoardInput{Name: "Existing Projects", ProjectIDs: []string{want.ID}})
	if err != nil {
		t.Fatalf("create Board on older v7 schema: %v", err)
	}
	// Exercise the column lists used by the original Project schema.
	execSQL(t, store.db, "INSERT INTO projects(id,name,version) VALUES('old-app','Created by older app',1)")
	execSQL(t, store.db, "UPDATE projects SET name='Renamed by older app' WHERE id='existing'")
	version, err := databaseVersion(ctx, store.db)
	if err != nil || version != schemaVersion {
		t.Fatalf("schema version = %d, want %d: %v", version, schemaVersion, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	projects, err = reopened.ListProjects(ctx)
	if err != nil || len(projects) != 2 || projects[0].Color != defaultProjectColor || projects[0].WorkspaceDir != "" || projects[0].WorkspacePrompt != "" {
		t.Fatalf("unexpected defaults after earlier v7 writes: %+v, %v", projects, err)
	}
	saved.Name = "Renamed by older app"
	if projects[1] != saved {
		t.Fatalf("earlier v7 writes lost color or workspace: %+v; want %+v", projects[1], saved)
	}
	current, err := reopened.GetContext(ctx, task.ID)
	if err != nil || !reflect.DeepEqual(current.Task, task) || current.Workspace != (agent.Workspace{Dir: dir, Prompt: saved.WorkspacePrompt}) {
		t.Fatalf("reopening lost task context: %+v, %v", current, err)
	}
	boards, err := reopened.ListBoards(ctx)
	if err != nil || !reflect.DeepEqual(boards, []Board{board}) {
		t.Fatalf("reopening after earlier v7 writes lost saved Board: %+v, %v", boards, err)
	}
}

func TestProjectWorkspaceUpdateValidation(t *testing.T) {
	store := openTest(t)
	ctx := t.Context()
	dir := t.TempDir()
	project, err := store.CreateProject(ctx, ProjectInput{Name: "Work", WorkspaceDir: &dir, WorkspacePrompt: ptr("Keep this prompt")})
	if err != nil {
		t.Fatal(err)
	}
	for _, in := range []ProjectInput{
		{Name: project.Name, WorkspaceDir: ptr("relative/path")},
		{Name: project.Name, WorkspaceDir: ptr(filepath.Join(dir, "missing"))},
		{Name: project.Name, WorkspacePrompt: ptr(strings.Repeat("字", 2001))},
	} {
		if _, err := store.UpdateProject(ctx, project.ID, in, project.Version); !errors.Is(err, ErrInvalid) {
			t.Fatalf("accepted invalid workspace update: %v", err)
		}
	}
	input := ProjectInput{Name: project.Name, WorkspacePrompt: ptr("")}
	if _, err := store.UpdateProject(ctx, project.ID, input, project.Version+1); !errors.Is(err, ErrConflict) {
		t.Fatalf("accepted stale workspace update: %v", err)
	}
	projects, err := store.ListProjects(ctx)
	if err != nil || !slices.Equal(projects, []Project{project}) {
		t.Fatalf("failed updates changed Project: %+v, %v", projects, err)
	}
	cleared, err := store.UpdateProject(ctx, project.ID, input, project.Version)
	if err != nil || cleared.WorkspaceDir != dir || cleared.WorkspacePrompt != "" || cleared.Version != project.Version+1 {
		t.Fatalf("clearing only prompt changed other workspace details: %+v, %v", cleared, err)
	}
}
