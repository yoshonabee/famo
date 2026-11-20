package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	activeTaskSchemaVersion = 6
	schemaVersion           = 7
)

const activeSchema = `
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    completed_at TEXT,
    deleted_at TEXT,
    version INTEGER NOT NULL,
    document JSON NOT NULL
);
CREATE TABLE IF NOT EXISTS task_order (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id),
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS task_order_position ON task_order(position);
CREATE TABLE IF NOT EXISTS agent_preferences (
    id INTEGER PRIMARY KEY CHECK(id=1),
    api_enabled INTEGER NOT NULL DEFAULT 1,
    workspace_dir TEXT NOT NULL DEFAULT '',
    workspace_prompt TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO agent_preferences(id) VALUES(1);
`

const orderNewTasks = `
CREATE TRIGGER IF NOT EXISTS tasks_order_insert AFTER INSERT ON tasks BEGIN
    INSERT INTO task_order(task_id,position)
    VALUES(NEW.id,(SELECT COALESCE(MAX(position),0)+1 FROM task_order));
END;
`

const boardSchema = `
CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS board_projects (
    board_id TEXT NOT NULL REFERENCES boards(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    PRIMARY KEY (board_id,project_id)
);
CREATE INDEX IF NOT EXISTS board_projects_project ON board_projects(project_id);
CREATE TRIGGER IF NOT EXISTS boards_remove_projects BEFORE DELETE ON boards BEGIN
    DELETE FROM board_projects WHERE board_id=OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS projects_remove_from_boards BEFORE DELETE ON projects BEGIN
    UPDATE boards SET version=version+1 WHERE id IN (
        SELECT board_id FROM board_projects WHERE project_id=OLD.id
    );
    DELETE FROM board_projects WHERE project_id=OLD.id;
END;
`

type schemaReader interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func databaseVersion(ctx context.Context, db schemaReader) (int, error) {
	var version int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return 0, err
	}
	if version > schemaVersion {
		return 0, fmt.Errorf("資料庫版本 %d 高於此程式支援版本", version)
	}
	return version, nil
}

func tableExists(ctx context.Context, db schemaReader, name string) (bool, error) {
	var exists bool
	err := db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?)", name).Scan(&exists)
	return exists, err
}

func migrate(db *sql.DB) error {
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := migrateSchema(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

func migrateSchema(ctx context.Context, tx *sql.Tx) error {
	if err := migrateTasksAndProjects(ctx, tx); err != nil {
		return err
	}
	// Boards are additive and leave the v7 task and Project schema readable by older builds.
	_, err := tx.ExecContext(ctx, boardSchema)
	return err
}

func migrateTasksAndProjects(ctx context.Context, tx *sql.Tx) error {
	version, err := databaseVersion(ctx, tx)
	if err != nil {
		return err
	}
	if version == schemaVersion {
		return ensureProjectColor(ctx, tx)
	}
	if version >= activeTaskSchemaVersion {
		return migrateProjects(ctx, tx)
	}
	// Leave original rows and options archived until the user confirms cleanup.
	if _, err := tx.ExecContext(ctx, `
DROP TRIGGER IF EXISTS tasks_order_insert;
DROP INDEX IF EXISTS tasks_home;
DROP INDEX IF EXISTS task_order_position;`); err != nil {
		return err
	}
	for _, name := range []string{"tasks", "task_order", "settings"} {
		exists, err := tableExists(ctx, tx, name)
		if err != nil {
			return err
		}
		if exists {
			if _, err := tx.ExecContext(ctx, "ALTER TABLE "+name+" RENAME TO famo_legacy_"+name); err != nil {
				return err
			}
		}
	}
	if _, err := tx.ExecContext(ctx, activeSchema); err != nil {
		return err
	}
	archived, err := tableExists(ctx, tx, "famo_legacy_tasks")
	if err != nil {
		return err
	}
	if archived {
		if err := copyLegacyTasks(ctx, tx); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, orderNewTasks); err != nil {
		return err
	}
	return migrateProjects(ctx, tx)
}

func migrateProjects(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, `
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    color TEXT NOT NULL DEFAULT '`+defaultProjectColor+`',
    version INTEGER NOT NULL
);
`+fmt.Sprintf("PRAGMA user_version=%d;", schemaVersion))
	return err
}

// Earlier v7 builds already support Projects and can still read and update them
// when the color column is present. Add it without changing the schema version.
func ensureProjectColor(ctx context.Context, tx *sql.Tx) error {
	var exists bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pragma_table_info('projects') WHERE name='color')`).Scan(&exists)
	if err != nil || exists {
		return err
	}
	_, err = tx.ExecContext(ctx, "ALTER TABLE projects ADD COLUMN color TEXT NOT NULL DEFAULT '"+defaultProjectColor+"'")
	return err
}

func copyLegacyTasks(ctx context.Context, tx *sql.Tx) error {
	loaded, err := readLegacyTasks(ctx, tx)
	if err != nil {
		return err
	}
	for _, task := range loaded {
		doc, err := json.Marshal(task)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO tasks(id,completed_at,deleted_at,version,document) VALUES(?,?,?,?,?)`,
			task.ID, task.CompletedAt, task.DeletedAt, task.Version, string(doc)); err != nil {
			return err
		}
	}
	hasOrder, err := tableExists(ctx, tx, "famo_legacy_task_order")
	if err != nil {
		return err
	}
	if hasOrder {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO task_order(task_id,position)
SELECT t.id,o.position FROM famo_legacy_task_order o JOIN tasks t ON o.task_id=t.id;`); err != nil {
			return err
		}
	}
	// Versions before manual ordering used priority and creation time.
	_, err = tx.ExecContext(ctx, `
INSERT INTO task_order(task_id,position)
SELECT id,(SELECT COALESCE(MAX(position),0) FROM task_order)+ROW_NUMBER() OVER(
    ORDER BY priority DESC,json_extract(document,'$.created_at'),id)
FROM famo_legacy_tasks WHERE id NOT IN(SELECT task_id FROM task_order);`)
	return err
}

func readLegacyTasks(ctx context.Context, tx *sql.Tx) ([]Task, error) {
	rows, err := tx.QueryContext(ctx, "SELECT id,version,document FROM famo_legacy_tasks")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []Task
	for rows.Next() {
		var rowID, raw string
		var version int
		if err := rows.Scan(&rowID, &version, &raw); err != nil {
			return nil, err
		}
		task, err := decodeLegacyTask(raw)
		if err != nil {
			return nil, fmt.Errorf("讀取舊任務 %s：%w", rowID, err)
		}
		task.ID, task.Version = rowID, version
		result = append(result, task)
	}
	return result, rows.Err()
}

func decodeLegacyTask(raw string) (Task, error) {
	var old struct {
		Task
		Description json.RawMessage `json:"description"`
		Goal        string          `json:"goal"`
		Context     string          `json:"context"`
		Acceptance  string          `json:"acceptance"`
	}
	if err := json.Unmarshal([]byte(raw), &old); err != nil {
		return Task{}, err
	}
	task := old.Task
	if old.Description != nil {
		if err := json.Unmarshal(old.Description, &task.Description); err != nil {
			return Task{}, err
		}
	} else {
		var sections []string
		for _, section := range []struct{ title, content string }{
			{"目標", old.Goal}, {"背景脈絡", old.Context}, {"驗收條件", old.Acceptance},
		} {
			if strings.TrimSpace(section.content) != "" {
				sections = append(sections, section.title+"\n"+section.content)
			}
		}
		task.Description = strings.Join(sections, "\n\n")
	}
	if task.Links == nil {
		task.Links = []Link{}
	}
	return task, nil
}
