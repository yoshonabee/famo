CREATE TABLE sync_collections (
    account_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    operation_id TEXT NOT NULL,
    document TEXT NOT NULL,
    PRIMARY KEY (account_id, version),
    UNIQUE (account_id, operation_id)
);
