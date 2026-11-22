CREATE TABLE sync_changes (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    document TEXT NOT NULL,
    UNIQUE (account_id, operation_id)
);

CREATE INDEX sync_changes_account_sequence ON sync_changes (account_id, sequence);

CREATE TABLE sync_tasks (
    account_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    sequence INTEGER NOT NULL REFERENCES sync_changes (sequence),
    PRIMARY KEY (account_id, task_id)
);

CREATE TRIGGER sync_changes_publish AFTER INSERT ON sync_changes
BEGIN
    INSERT INTO sync_tasks (account_id, task_id, version, sequence)
    VALUES (NEW.account_id, NEW.task_id, NEW.version, NEW.sequence)
    ON CONFLICT (account_id, task_id) DO UPDATE SET
        version = excluded.version,
        sequence = excluded.sequence;
END;
