package tasks

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func legacyDatabase(t *testing.T, version int) (string, *sql.DB) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "old tasks #1.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	execSQL(t, db, fmt.Sprintf(`
PRAGMA user_version=%d;
CREATE TABLE tasks (
    id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'general', stage TEXT NOT NULL DEFAULT '待開始',
    waiting_reason TEXT NOT NULL DEFAULT '舊等待原因', review_at TEXT, completed_at TEXT,
    priority INTEGER NOT NULL, version INTEGER NOT NULL,
    steps JSON NOT NULL DEFAULT '[]', links JSON NOT NULL DEFAULT '[]',
    metadata JSON NOT NULL DEFAULT '{}', document JSON NOT NULL
);
CREATE INDEX tasks_home ON tasks(completed_at,priority,review_at);`, version))
	if version >= 2 {
		execSQL(t, db, `
CREATE TABLE task_order (task_id TEXT PRIMARY KEY REFERENCES tasks(id), position INTEGER NOT NULL);
CREATE INDEX task_order_position ON task_order(position);
CREATE TRIGGER tasks_order_insert AFTER INSERT ON tasks BEGIN
    INSERT INTO task_order(task_id,position) VALUES(NEW.id,(SELECT COALESCE(MAX(position),0)+1 FROM task_order));
END;`)
	}
	if version >= 3 {
		execSQL(t, db, "ALTER TABLE tasks ADD COLUMN deleted_at TEXT")
	}
	if version >= 4 {
		execSQL(t, db, `
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, document JSON NOT NULL);
INSERT INTO settings VALUES(1,2,'{"workflows":["舊設定"]}');`)
	}
	return path, db
}

func execSQL(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}

func TestCleanupKeepsActiveDataAndBacksUpArchive(t *testing.T) {
	path, old := legacyDatabase(t, 5)
	execSQL(t, old, `
INSERT INTO tasks(id,priority,version,document) VALUES
('a',0,4,'{"id":"a","version":4,"title":"調查登入","scheduled_date":"2026-11-18","description":"保留這段備註","goal":"舊目標","waiting_reason":"舊等待原因","steps":[{"title":"舊步驟"}],"metadata":{"repo":"舊資料"},"history":[{"source":"old agent"}],"created_at":"2026-11-13T00:00:00Z","updated_at":"2026-11-17T00:00:00Z","links":[{"type":"Custom","type_id":"custom","url":"https://example.com/1"},{"type":"Custom","url":"https://example.com/1"}]}'),
('b',2,3,'{"id":"b","version":3,"title":"這筆的備註刻意留白","description":"","context":"舊脈絡"}'),
('done',1,2,'{"id":"done","version":2,"title":"已完成","completed_at":"2026-11-18T00:00:00Z","links":[]}'),
('deleted',1,5,'{"id":"deleted","version":5,"title":"已刪除","deleted_at":"2026-11-18T00:00:00Z"}');
UPDATE tasks SET completed_at=json_extract(document,'$.completed_at'), deleted_at=json_extract(document,'$.deleted_at');
UPDATE task_order SET position=10 WHERE task_id='a';
CREATE TABLE agent_preferences (id INTEGER PRIMARY KEY, api_enabled INTEGER NOT NULL, workspace_dir TEXT NOT NULL, workspace_prompt TEXT NOT NULL);
INSERT INTO agent_preferences VALUES(1,0,'/workspace','先看 README');`)
	if err := old.Close(); err != nil {
		t.Fatal(err)
	}

	oldBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := PreviewCleanup(t.Context(), path)
	if err != nil || preview.SchemaVersion != 5 || preview.LegacyTasks != 4 || preview.LegacyOptions != 1 || preview.Applied {
		t.Fatalf("unexpected preview: %+v, %v", preview, err)
	}
	if _, err := ApplyCleanup(t.Context(), path, path); err == nil {
		t.Fatal("cleanup overwrote the active database as its backup")
	}
	stillOld, err := os.ReadFile(path)
	if err != nil || !reflect.DeepEqual(oldBytes, stillOld) {
		t.Fatalf("failed backup changed the database: %v", err)
	}

	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	list, err := store.List(t.Context())
	if err != nil || len(list) != 3 || list[0].ID != "b" || list[1].ID != "a" || list[2].ID != "done" || list[2].CompletedAt == nil {
		t.Fatalf("migration changed ordering or status: %+v, %v", list, err)
	}
	if list[0].Description != "" || list[0].ScheduledDate != "" {
		t.Fatalf("migration filled intentionally empty fields: %+v", list[0])
	}
	current := list[1]
	if current.Description != "保留這段備註" || current.ScheduledDate != "2026-11-18" || current.Version != 4 ||
		current.CreatedAt.IsZero() || current.UpdatedAt.IsZero() ||
		!reflect.DeepEqual(current.Links, []Link{{URL: "https://example.com/1"}, {URL: "https://example.com/1"}}) {
		t.Fatalf("migration changed current content: %+v", current)
	}
	active, err := json.Marshal(current)
	if err != nil {
		t.Fatal(err)
	}
	for _, oldKey := range []string{"goal", "steps", "waiting_reason", "metadata", "history", "type_id"} {
		if strings.Contains(string(active), `"`+oldKey+`"`) {
			t.Fatalf("current task still carries %s: %s", oldKey, active)
		}
	}
	if enabled, err := store.AgentAPIEnabled(t.Context()); err != nil || enabled {
		t.Fatalf("Agent API preference changed: %v, %v", enabled, err)
	}
	if workspace, err := store.Workspace(t.Context()); err != nil || workspace.Prompt != "先看 README" || workspace.Dir != "/workspace" {
		t.Fatalf("workspace changed: %+v, %v", workspace, err)
	}

	updated, err := store.Act(t.Context(), "a", Action{Op: "update", Version: 4, Description: ptr("升級後編輯")})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(filepath.Dir(path), "backup #1.db")
	report, err := ApplyCleanup(t.Context(), path, backup)
	if err != nil || !report.Applied || report.SchemaVersion != schemaVersion || report.Backup != backup || report.LegacyTasks != 4 {
		t.Fatalf("cleanup: %+v, %v", report, err)
	}
	if info, err := os.Stat(backup); err != nil || info.Mode().Perm()&0077 != 0 {
		t.Fatalf("backup was not saved privately: %v", err)
	}
	preview, err = PreviewCleanup(t.Context(), path)
	if err != nil || preview.SchemaVersion != schemaVersion || len(preview.LegacyTables) != 0 {
		t.Fatalf("cleanup left archives: %+v, %v", preview, err)
	}
	report, err = ApplyCleanup(t.Context(), path, backup)
	if err != nil || report.Applied || report.Backup != "" {
		t.Fatalf("repeated cleanup: %+v, %v", report, err)
	}

	clean, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer clean.Close()
	got, err := clean.Get(t.Context(), "a")
	if err != nil || !reflect.DeepEqual(got, updated) {
		t.Fatalf("cleanup changed edited task: %+v, %v", got, err)
	}
	var deleted, position int
	if err := clean.db.QueryRow("SELECT COUNT(*) FROM tasks WHERE id='deleted' AND deleted_at IS NOT NULL AND version=5").Scan(&deleted); err != nil || deleted != 1 {
		t.Fatalf("soft-deleted task lost: %d, %v", deleted, err)
	}
	if err := clean.db.QueryRow("SELECT position FROM task_order WHERE task_id='a'").Scan(&position); err != nil || position != 10 {
		t.Fatalf("manual position lost: %d, %v", position, err)
	}
	snapshot, err := openCleanupDB(backup, false)
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var oldNotes, activeNotes string
	if err := snapshot.QueryRow("SELECT json_extract(document,'$.goal') FROM famo_legacy_tasks WHERE id='a'").Scan(&oldNotes); err != nil || oldNotes != "舊目標" {
		t.Fatalf("backup missing original legacy content: %q, %v", oldNotes, err)
	}
	if err := snapshot.QueryRow("SELECT json_extract(document,'$.description') FROM tasks WHERE id='a'").Scan(&activeNotes); err != nil || activeNotes != updated.Description {
		t.Fatalf("backup missing work since migration: %q, %v", activeNotes, err)
	}
}

func TestCleanupMigratesPreDescriptionDatabases(t *testing.T) {
	for _, version := range []int{1, 2} {
		t.Run(fmt.Sprint(version), func(t *testing.T) {
			path, old := legacyDatabase(t, version)
			execSQL(t, old, `
INSERT INTO tasks(id,priority,version,document) VALUES
('a',2,2,'{"title":"舊任務","goal":"登入","context":"Slack","acceptance":"測試通過"}'),
('b',0,1,'{"title":"低優先"}');`)
			first := "a"
			if version == 2 {
				execSQL(t, old, "UPDATE task_order SET position=3 WHERE task_id='a'")
				first = "b"
			}
			if err := old.Close(); err != nil {
				t.Fatal(err)
			}
			report, err := ApplyCleanup(t.Context(), path, path+".backup")
			if err != nil || !report.Applied {
				t.Fatalf("direct cleanup: %+v, %v", report, err)
			}
			store, err := Open(path)
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			list, err := store.List(t.Context())
			if err != nil || len(list) != 2 || list[0].ID != first {
				t.Fatalf("order changed: %+v, %v", list, err)
			}
			got, err := store.Get(t.Context(), "a")
			if err != nil || got.Description != "目標\n登入\n\n背景脈絡\nSlack\n\n驗收條件\n測試通過" || got.Version != 2 {
				t.Fatalf("pre-description context was lost: %+v, %v", got, err)
			}
			added, err := store.Create(t.Context(), CreateInput{Title: "新任務"})
			if err != nil {
				t.Fatal(err)
			}
			list, err = store.List(t.Context())
			if err != nil || len(list) != 3 || list[2].ID != added.ID {
				t.Fatalf("new task order: %+v, %v", list, err)
			}
		})
	}
}

func TestCleanupSnapshotIncludesUncheckpointedWAL(t *testing.T) {
	path, old := legacyDatabase(t, 5)
	old.SetMaxOpenConns(1)
	execSQL(t, old, `PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;`)
	execSQL(t, old, `
INSERT INTO tasks(id,priority,version,document) VALUES
('wal',0,1,'{"title":"尚在 WAL 中","goal":"舊欄位"}');`)
	if info, err := os.Stat(path + "-wal"); err != nil || info.Size() == 0 {
		t.Fatalf("fixture did not leave WAL frames: %v", err)
	}
	backup := path + ".backup"
	report, err := ApplyCleanup(t.Context(), path, backup)
	if err != nil || !report.Applied {
		t.Fatalf("cleanup: %+v, %v", report, err)
	}
	copied, err := openCleanupDB(backup, false)
	if err != nil {
		t.Fatal(err)
	}
	defer copied.Close()
	var goal string
	if err := copied.QueryRow("SELECT json_extract(document,'$.goal') FROM tasks WHERE id='wal'").Scan(&goal); err != nil || goal != "舊欄位" {
		t.Fatalf("backup did not include WAL row: %q, %v", goal, err)
	}
}

func TestCleanupRollsBackInvalidLegacyData(t *testing.T) {
	path, old := legacyDatabase(t, 5)
	execSQL(t, old, `INSERT INTO tasks(id,priority,version,document) VALUES ('bad',0,1,'[');`)
	if err := old.Close(); err != nil {
		t.Fatal(err)
	}
	backup := path + ".backup"
	report, err := ApplyCleanup(t.Context(), path, backup)
	if err == nil || report.Applied || report.Backup != backup {
		t.Fatalf("malformed task did not stop cleanup after backup: %+v, %v", report, err)
	}
	preview, err := PreviewCleanup(t.Context(), path)
	if err != nil || preview.SchemaVersion != 5 || preview.LegacyTasks != 1 {
		t.Fatalf("failed cleanup changed original data: %+v, %v", preview, err)
	}
}
