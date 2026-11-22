package tasks

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
)

const collectionSyncSchema = `
CREATE TABLE IF NOT EXISTS sync_collections (
    id INTEGER PRIMARY KEY CHECK(id=1),
    baseline TEXT NOT NULL,
    pending TEXT,
    conflict TEXT,
    rejection INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync_removed_projects (
    id TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS sync_collection_deleted_versions (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    PRIMARY KEY (kind,id)
);
CREATE TRIGGER IF NOT EXISTS projects_sync_deleted_version AFTER DELETE ON projects
WHEN EXISTS(SELECT 1 FROM sync_binding WHERE id=1)
BEGIN
    INSERT INTO sync_collection_deleted_versions(kind,id,version) VALUES('project',OLD.id,OLD.version)
    ON CONFLICT(kind,id) DO UPDATE SET version=MAX(version,excluded.version);
END;
CREATE TRIGGER IF NOT EXISTS boards_sync_deleted_version AFTER DELETE ON boards
WHEN EXISTS(SELECT 1 FROM sync_binding WHERE id=1)
BEGIN
    INSERT INTO sync_collection_deleted_versions(kind,id,version) VALUES('board',OLD.id,OLD.version)
    ON CONFLICT(kind,id) DO UPDATE SET version=MAX(version,excluded.version);
END;
`

type SyncProject struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	Position *int   `json:"position"`
}

type SyncBoard struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Icon       string   `json:"icon"`
	ProjectIDs []string `json:"project_ids"`
}

// CollectionContent contains only the fields shared between devices.
type CollectionContent struct {
	Projects []SyncProject `json:"projects"`
	Boards   []SyncBoard   `json:"boards"`
}

type SyncCollections struct {
	Version int64 `json:"version"`
	CollectionContent
}

type CollectionOperation struct {
	OperationID string `json:"operation_id"`
	BaseVersion int64  `json:"base_version"`
	CollectionContent
}

type CollectionConflict struct {
	Local      CollectionContent `json:"local"`
	Remote     SyncCollections   `json:"remote"`
	LocalToken string            `json:"local_token"`
}

type CollectionSyncStatus struct {
	Version   int64               `json:"version"`
	Pending   bool                `json:"pending"`
	Conflict  *CollectionConflict `json:"conflict,omitempty"`
	Rejection int                 `json:"rejection,omitempty"`
}

type collectionSyncState struct {
	baseline  SyncCollections
	pending   *CollectionOperation
	conflict  *SyncCollections
	rejection int
}

func readCollectionSyncState(ctx context.Context, tx *sql.Tx) (collectionSyncState, error) {
	state := collectionSyncState{baseline: SyncCollections{
		CollectionContent: CollectionContent{Projects: []SyncProject{}, Boards: []SyncBoard{}},
	}}
	var baseline string
	var pending, conflict *string
	err := tx.QueryRowContext(ctx, `SELECT baseline,pending,conflict,rejection FROM sync_collections WHERE id=1`).
		Scan(&baseline, &pending, &conflict, &state.rejection)
	if errors.Is(err, sql.ErrNoRows) {
		return state, nil
	}
	if err != nil {
		return state, err
	}
	if err := json.Unmarshal([]byte(baseline), &state.baseline); err != nil {
		return state, err
	}
	if pending != nil {
		if err := json.Unmarshal([]byte(*pending), &state.pending); err != nil {
			return state, err
		}
	}
	if conflict != nil {
		err = json.Unmarshal([]byte(*conflict), &state.conflict)
	}
	return state, err
}

func (state collectionSyncState) save(ctx context.Context, tx *sql.Tx) error {
	baseline, err := json.Marshal(state.baseline)
	if err != nil {
		return err
	}
	var pending, conflict *string
	if state.pending != nil {
		raw, err := json.Marshal(state.pending)
		if err != nil {
			return err
		}
		doc := string(raw)
		pending = &doc
	}
	if state.conflict != nil {
		raw, err := json.Marshal(state.conflict)
		if err != nil {
			return err
		}
		doc := string(raw)
		conflict = &doc
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO sync_collections(id,baseline,pending,conflict,rejection) VALUES(1,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET baseline=excluded.baseline,pending=excluded.pending,
			conflict=excluded.conflict,rejection=excluded.rejection`,
		string(baseline), pending, conflict, state.rejection)
	return err
}

// PrepareCollectionSync persists a push before it can be sent. When both
// devices changed the same baseline, the two collections remain available
// for explicit review rather than replacing a device's unsynced changes.
func (s *Store) PrepareCollectionSync(ctx context.Context, remote SyncCollections) (*CollectionOperation, bool, error) {
	if err := remote.normalize(); err != nil {
		return nil, false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer tx.Rollback()
	state, err := readCollectionSyncState(ctx, tx)
	if err != nil {
		return nil, false, err
	}
	if state.pending != nil && state.rejection == 0 {
		return state.pending, false, nil
	}
	if remote.Version < state.baseline.Version ||
		(remote.Version == state.baseline.Version && !sameCollection(remote.CollectionContent, state.baseline.CollectionContent)) {
		return nil, false, errors.New("collection sync version went backwards or changed without a version")
	}
	local, err := readCollectionContent(ctx, tx)
	if err != nil {
		return nil, false, err
	}

	remoteChanged := !sameCollection(remote.CollectionContent, state.baseline.CollectionContent)
	localChanged := !sameCollection(local, state.baseline.CollectionContent)
	matchesRemote := sameCollection(local, remote.CollectionContent)

	var applied bool
	switch {
	case matchesRemote || !localChanged:
		if !matchesRemote {
			if err := applyCollectionContent(ctx, tx, local, remote.CollectionContent); err != nil {
				return nil, false, err
			}
			applied = true
		}
		if remoteChanged && matchesRemote {
			if err := recordCollectionProjects(ctx, tx, state.baseline.CollectionContent, remote.CollectionContent); err != nil {
				return nil, false, err
			}
		}
		if remote.Version == state.baseline.Version && state.pending == nil && state.conflict == nil {
			return nil, false, nil
		}
		state = collectionSyncState{baseline: remote}
	case remoteChanged:
		state.pending, state.rejection = nil, 0
		state.conflict = &remote
	case state.rejection != 0 && state.pending != nil && sameCollection(local, state.pending.CollectionContent):
		return nil, false, nil
	default:
		state = collectionSyncState{
			baseline: remote,
			pending: &CollectionOperation{
				OperationID: id(), BaseVersion: remote.Version, CollectionContent: local,
			},
		}
	}
	if err := state.save(ctx, tx); err != nil {
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return state.pending, applied, nil
}

func (s *Store) ConfirmCollectionSync(ctx context.Context, op CollectionOperation, remote SyncCollections) error {
	if err := remote.normalize(); err != nil {
		return err
	}
	if remote.Version != op.BaseVersion+1 || !sameCollection(remote.CollectionContent, op.CollectionContent) {
		return errors.New("malformed collection sync acknowledgement")
	}
	return s.updateCollectionOperation(ctx, op.OperationID, func(tx *sql.Tx, state *collectionSyncState) error {
		if err := recordCollectionProjects(ctx, tx, state.baseline.CollectionContent, remote.CollectionContent); err != nil {
			return err
		}
		*state = collectionSyncState{baseline: remote}
		return nil
	})
}

func (s *Store) ConflictCollectionSync(ctx context.Context, op CollectionOperation, remote SyncCollections) error {
	if err := remote.normalize(); err != nil {
		return err
	}
	if remote.Version <= op.BaseVersion {
		return errors.New("malformed collection sync conflict")
	}
	return s.updateCollectionOperation(ctx, op.OperationID, func(_ *sql.Tx, state *collectionSyncState) error {
		state.pending, state.rejection = nil, 0
		state.conflict = &remote
		return nil
	})
}

func (s *Store) RejectCollectionSync(ctx context.Context, op CollectionOperation, status int) error {
	return s.updateCollectionOperation(ctx, op.OperationID, func(_ *sql.Tx, state *collectionSyncState) error {
		state.rejection = status
		return nil
	})
}

func (s *Store) updateCollectionOperation(ctx context.Context, operationID string, update func(*sql.Tx, *collectionSyncState) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	state, err := readCollectionSyncState(ctx, tx)
	if err != nil {
		return err
	}
	if state.pending == nil || state.pending.OperationID != operationID {
		return nil
	}
	if err := update(tx, &state); err != nil {
		return err
	}
	if err := state.save(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

func collectionStatus(ctx context.Context, tx *sql.Tx) (CollectionSyncStatus, error) {
	state, err := readCollectionSyncState(ctx, tx)
	if err != nil {
		return CollectionSyncStatus{}, err
	}
	local, err := readCollectionContent(ctx, tx)
	if err != nil {
		return CollectionSyncStatus{}, err
	}
	status := CollectionSyncStatus{
		Version: state.baseline.Version, Rejection: state.rejection,
		Pending: state.pending != nil || !sameCollection(local, state.baseline.CollectionContent),
	}
	if state.conflict != nil {
		token, err := collectionToken(local)
		if err != nil {
			return CollectionSyncStatus{}, err
		}
		status.Conflict = &CollectionConflict{Local: local, Remote: *state.conflict, LocalToken: token}
	}
	return status, nil
}

func (s *Store) ResolveCollectionConflict(ctx context.Context, token string, version int64, keepLocal bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	state, err := readCollectionSyncState(ctx, tx)
	if err != nil {
		return err
	}
	if state.conflict == nil {
		return errors.New("no Project or Board sync conflict")
	}
	local, err := readCollectionContent(ctx, tx)
	if err != nil {
		return err
	}
	current, err := collectionToken(local)
	if err != nil {
		return err
	}
	if current != token || state.conflict.Version != version {
		return errors.New("collection sync conflict changed; read sync status again")
	}

	remote := *state.conflict
	baseline := state.baseline.CollectionContent
	state = collectionSyncState{baseline: remote}
	if keepLocal {
		// Only retire Projects removed on both devices. Locally proposed
		// deletions are finalized when the Worker accepts the new snapshot.
		retained := CollectionContent{Projects: append(slices.Clone(remote.Projects), local.Projects...)}
		if err := recordCollectionProjects(ctx, tx, baseline, retained); err != nil {
			return err
		}
		state.pending = &CollectionOperation{
			OperationID: id(), BaseVersion: remote.Version, CollectionContent: local,
		}
	} else {
		if !sameCollection(local, remote.CollectionContent) {
			if err := applyCollectionContent(ctx, tx, local, remote.CollectionContent); err != nil {
				return err
			}
		}
		if err := recordCollectionProjects(ctx, tx, baseline, remote.CollectionContent); err != nil {
			return err
		}
	}
	if err := state.save(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

func collectionToken(local CollectionContent) (string, error) {
	raw, err := json.Marshal(local)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", sha256.Sum256(raw)), nil
}

func sameCollection(a, b CollectionContent) bool {
	return reflect.DeepEqual(a, b)
}

func (collection *SyncCollections) normalize() error {
	if collection.Version < 0 || collection.Projects == nil || collection.Boards == nil ||
		(collection.Version == 0 && (len(collection.Projects) != 0 || len(collection.Boards) != 0)) {
		return errors.New("malformed Project and Board sync response")
	}
	projects := make(map[string]bool, len(collection.Projects))
	for i := range collection.Projects {
		p := &collection.Projects[i]
		project, err := validateProjectInput(ProjectInput{Name: p.Name, Color: &p.Color})
		if err != nil || p.ID == "" || projects[p.ID] || (p.Position != nil && *p.Position < 0) {
			return errors.New("invalid synced Project")
		}
		projects[p.ID] = true
		p.Name, p.Color = project.Name, *project.Color
	}
	boards := make(map[string]bool, len(collection.Boards))
	for i := range collection.Boards {
		b := &collection.Boards[i]
		board, err := validateBoardInput(BoardInput{Name: b.Name, Icon: &b.Icon, ProjectIDs: b.ProjectIDs})
		if err != nil || b.ID == "" || boards[b.ID] {
			return errors.New("invalid synced Board")
		}
		for _, projectID := range board.ProjectIDs {
			if !projects[projectID] {
				return errors.New("synced Board references a missing Project")
			}
		}
		boards[b.ID] = true
		b.Name, b.ProjectIDs = board.Name, board.ProjectIDs
	}
	slices.SortFunc(collection.Projects, func(a, b SyncProject) int { return strings.Compare(a.ID, b.ID) })
	slices.SortFunc(collection.Boards, func(a, b SyncBoard) int { return strings.Compare(a.ID, b.ID) })
	return nil
}
