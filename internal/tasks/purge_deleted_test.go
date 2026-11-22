package tasks

import (
	"testing"
	"time"
)

func TestPurgeExpiredDeleted(t *testing.T) {
	s := openTest(t)
	now := time.Date(2026, 11, 20, 12, 0, 0, 500_000_000, time.UTC)
	cutoff := now.Add(-deletionRetention)
	atBoundary := softDeleteAt(t, s, cutoff)
	expired := softDeleteAt(t, s, cutoff.Add(-time.Nanosecond))
	inside := softDeleteAt(t, s, cutoff.Add(time.Nanosecond).In(time.FixedZone("+0800", 8*60*60)))
	active := createTest(t, s)

	if count, err := s.purgeExpiredDeletedAt(t.Context(), now); err != nil || count != 2 {
		t.Fatalf("purge count = %d, error = %v", count, err)
	}
	for _, task := range []Task{expired, atBoundary} {
		assertTaskRecordCount(t, s, task.ID, 0)
	}
	for _, task := range []Task{inside, active} {
		assertTaskRecordCount(t, s, task.ID, 2)
	}
	if _, err := s.restoreAt(t.Context(), inside.ID, inside.Version, now); err != nil {
		t.Fatalf("restore within the retention window: %v", err)
	}
	if count, err := s.purgeExpiredDeletedAt(t.Context(), now); err != nil || count != 0 {
		t.Fatalf("repeat purge count = %d, error = %v", count, err)
	}
}

func TestPurgeExpiredDeletedRollsBackOrder(t *testing.T) {
	s := openTest(t)
	now := time.Now().UTC()
	task := softDeleteAt(t, s, now.Add(-deletionRetention))
	if _, err := s.db.ExecContext(t.Context(), `
		CREATE TRIGGER prevent_purge BEFORE DELETE ON tasks BEGIN
			SELECT RAISE(ABORT, 'purge failed');
		END`); err != nil {
		t.Fatal(err)
	}
	if count, err := s.purgeExpiredDeletedAt(t.Context(), now); err == nil || count != 0 {
		t.Fatalf("failed purge count = %d, error = %v", count, err)
	}
	assertTaskRecordCount(t, s, task.ID, 2)
}

func assertTaskRecordCount(t *testing.T, s *Store, id string, want int) {
	t.Helper()
	var count int
	err := s.db.QueryRowContext(t.Context(), `
		SELECT (SELECT COUNT(*) FROM tasks WHERE id=?)
		     + (SELECT COUNT(*) FROM task_order WHERE task_id=?)`, id, id).Scan(&count)
	if err != nil || count != want {
		t.Fatalf("task and order record count = %d, want %d, error = %v", count, want, err)
	}
}
