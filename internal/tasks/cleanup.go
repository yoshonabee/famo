package tasks

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
)

type CleanupReport struct {
	SchemaVersion int      `json:"schema_version"`
	LegacyTasks   int      `json:"legacy_tasks"`
	LegacyOptions int      `json:"legacy_option_rows"`
	LegacyTables  []string `json:"legacy_tables"`
	Backup        string   `json:"backup,omitempty"`
	Applied       bool     `json:"applied"`
}

func PreviewCleanup(ctx context.Context, path string) (CleanupReport, error) {
	db, err := openCleanupDB(path, false)
	if err != nil {
		return CleanupReport{}, err
	}
	defer db.Close()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return CleanupReport{}, err
	}
	defer tx.Rollback()
	return cleanupReport(ctx, tx)
}

func ApplyCleanup(ctx context.Context, path, backupPath string) (CleanupReport, error) {
	if backupPath == "" {
		return CleanupReport{}, errors.New("請指定備份路徑")
	}
	db, err := openCleanupDB(path, true)
	if err != nil {
		return CleanupReport{}, err
	}
	defer db.Close()
	// Take the write reservation before backing up so there can be no writes
	// between the backup snapshot and cleanup.
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return CleanupReport{}, err
	}
	defer tx.Rollback()
	report, err := cleanupReport(ctx, tx)
	if err != nil || len(report.LegacyTables) == 0 {
		return report, err
	}
	backup, err := filepath.Abs(backupPath)
	if err != nil {
		return report, err
	}
	if err := BackupDatabase(ctx, path, backup); err != nil {
		return report, fmt.Errorf("建立備份：%w", err)
	}
	report.Backup = backup
	if err := migrateTasks(ctx, tx); err != nil {
		return report, err
	}
	if _, err := tx.ExecContext(ctx, `
DROP TABLE IF EXISTS famo_legacy_task_order;
DROP TABLE IF EXISTS famo_legacy_tasks;
DROP TABLE IF EXISTS famo_legacy_settings;`); err != nil {
		return report, err
	}
	if err := tx.Commit(); err != nil {
		return report, err
	}
	report.Applied = true
	report.SchemaVersion = schemaVersion
	if _, err := db.ExecContext(ctx, "VACUUM"); err != nil {
		return report, fmt.Errorf("清理已提交，無法壓縮資料庫：%w", err)
	}
	var busy, frames, checkpointed int
	if err := db.QueryRowContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)").Scan(&busy, &frames, &checkpointed); err != nil {
		return report, fmt.Errorf("清理已提交，無法截斷 WAL：%w", err)
	}
	if busy != 0 {
		return report, errors.New("清理已提交，請關閉其他開啟資料庫的程序以截斷 WAL")
	}
	return report, nil
}

func cleanupReport(ctx context.Context, db schemaReader) (CleanupReport, error) {
	version, err := databaseVersion(ctx, db)
	if err != nil {
		return CleanupReport{}, err
	}
	report := CleanupReport{SchemaVersion: version, LegacyTables: []string{}}
	prefix := ""
	if version == schemaVersion {
		prefix = "famo_legacy_"
	}
	for _, entry := range []struct {
		name  string
		count *int
	}{
		{prefix + "tasks", &report.LegacyTasks},
		{prefix + "task_order", nil},
		{prefix + "settings", &report.LegacyOptions},
	} {
		exists, err := tableExists(ctx, db, entry.name)
		if err != nil {
			return CleanupReport{}, err
		}
		if !exists {
			continue
		}
		report.LegacyTables = append(report.LegacyTables, entry.name)
		if entry.count != nil {
			if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+entry.name).Scan(entry.count); err != nil {
				return CleanupReport{}, err
			}
		}
	}
	return report, nil
}

func openCleanupDB(path string, writable bool) (*sql.DB, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(absolute)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("請指定現有的 SQLite 檔案")
	}
	options := url.Values{"mode": {"ro"}, "_pragma": {"busy_timeout(5000)"}}
	if writable {
		options.Set("mode", "rw")
		options.Set("_txlock", "immediate")
		options.Add("_pragma", "secure_delete(ON)")
	}
	dsn := url.URL{Scheme: "file", Path: absolute, RawQuery: options.Encode()}
	db, err := sql.Open("sqlite", dsn.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

// BackupDatabase writes a consistent SQLite snapshot, including committed WAL
// changes, to a new private file while leaving the live database open.
func BackupDatabase(ctx context.Context, source, destination string) error {
	db, err := openCleanupDB(source, false)
	if err != nil {
		return err
	}
	defer db.Close()
	output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	if err := output.Close(); err != nil {
		os.Remove(destination)
		return err
	}
	if _, err := db.ExecContext(ctx, "VACUUM INTO ?", destination); err != nil {
		os.Remove(destination)
		return err
	}
	return nil
}
