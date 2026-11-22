package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"slices"
	"strings"
)

func readCollectionContent(ctx context.Context, tx *sql.Tx) (CollectionContent, error) {
	content := CollectionContent{Projects: []SyncProject{}, Boards: []SyncBoard{}}
	rows, err := tx.QueryContext(ctx, `SELECT id,name,color,position FROM projects ORDER BY id`)
	if err != nil {
		return content, err
	}
	defer rows.Close()
	for rows.Next() {
		var p SyncProject
		if err := rows.Scan(&p.ID, &p.Name, &p.Color, &p.Position); err != nil {
			return content, err
		}
		p.Color = strings.ToUpper(p.Color)
		content.Projects = append(content.Projects, p)
	}
	if err := rows.Err(); err != nil {
		return content, err
	}
	rows, err = tx.QueryContext(ctx, `
		SELECT b.id,b.name,b.icon,(
			SELECT json_group_array(project_id ORDER BY project_id)
			FROM board_projects WHERE board_id=b.id
		)
		FROM boards b ORDER BY b.id`)
	if err != nil {
		return content, err
	}
	defer rows.Close()
	for rows.Next() {
		var b SyncBoard
		var raw string
		if err := rows.Scan(&b.ID, &b.Name, &b.Icon, &raw); err != nil {
			return content, err
		}
		if err := json.Unmarshal([]byte(raw), &b.ProjectIDs); err != nil {
			return content, err
		}
		content.Boards = append(content.Boards, b)
	}
	return content, rows.Err()
}

type localCollectionSettings struct {
	dir, prompt string
	version     int
}

func readLocalCollectionSettings(ctx context.Context, tx *sql.Tx) (map[string]localCollectionSettings, map[string]int, error) {
	projects, boards := map[string]localCollectionSettings{}, map[string]int{}
	rows, err := tx.QueryContext(ctx, `
		SELECT id,workspace_dir,workspace_prompt,version FROM projects
		UNION ALL
		SELECT deleted.id,'','',deleted.version FROM sync_collection_deleted_versions deleted
		WHERE kind='project' AND NOT EXISTS(SELECT 1 FROM projects WHERE id=deleted.id)`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var settings localCollectionSettings
		if err := rows.Scan(&id, &settings.dir, &settings.prompt, &settings.version); err != nil {
			return nil, nil, err
		}
		projects[id] = settings
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	rows, err = tx.QueryContext(ctx, `
		SELECT id,version FROM boards
		UNION ALL
		SELECT deleted.id,deleted.version FROM sync_collection_deleted_versions deleted
		WHERE kind='board' AND NOT EXISTS(SELECT 1 FROM boards WHERE id=deleted.id)`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var version int
		if err := rows.Scan(&id, &version); err != nil {
			return nil, nil, err
		}
		boards[id] = version
	}
	return projects, boards, rows.Err()
}

func applyCollectionContent(ctx context.Context, tx *sql.Tx, current, next CollectionContent) error {
	projectSettings, boardVersions, err := readLocalCollectionSettings(ctx, tx)
	if err != nil {
		return err
	}
	previousProjects := make(map[string]SyncProject, len(current.Projects))
	for _, p := range current.Projects {
		previousProjects[p.ID] = p
	}
	previousBoards := make(map[string]SyncBoard, len(current.Boards))
	for _, b := range current.Boards {
		previousBoards[b.ID] = b
	}

	// Replace all names in a transaction so incoming name swaps can satisfy
	// SQLite's unique constraints. Local preferences and versions follow IDs.
	if _, err := tx.ExecContext(ctx, `DELETE FROM board_projects; DELETE FROM boards; DELETE FROM projects;`); err != nil {
		return err
	}
	for _, p := range next.Projects {
		settings := projectSettings[p.ID]
		previous := previousProjects[p.ID]
		if previous.Name != p.Name || previous.Color != p.Color {
			settings.version++
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO projects(id,name,color,workspace_dir,workspace_prompt,version,position)
			VALUES(?,?,?,?,?,?,?)`, p.ID, p.Name, p.Color, settings.dir, settings.prompt, settings.version, p.Position); err != nil {
			return projectWriteError(err)
		}
	}
	for _, b := range next.Boards {
		version := boardVersions[b.ID]
		previous := previousBoards[b.ID]
		if previous.Name != b.Name || previous.Icon != b.Icon || !slices.Equal(previous.ProjectIDs, b.ProjectIDs) {
			version++
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO boards(id,name,icon,version) VALUES(?,?,?,?)`, b.ID, b.Name, b.Icon, version); err != nil {
			return boardWriteError(err)
		}
		if err := insertBoardProjects(ctx, tx, Board{ID: b.ID, ProjectIDs: b.ProjectIDs}); err != nil {
			return err
		}
	}
	return recordCollectionProjects(ctx, tx, current, next)
}

func recordCollectionProjects(ctx context.Context, tx *sql.Tx, previous, next CollectionContent) error {
	retained := make(map[string]bool, len(next.Projects))
	nextIDs := make([]string, 0, len(next.Projects))
	for _, p := range next.Projects {
		retained[p.ID] = true
		nextIDs = append(nextIDs, p.ID)
	}
	removedIDs := []string{}
	for _, p := range previous.Projects {
		if !retained[p.ID] {
			removedIDs = append(removedIDs, p.ID)
		}
	}
	nextJSON, err := json.Marshal(nextIDs)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sync_removed_projects WHERE id IN (SELECT value FROM json_each(?))`, string(nextJSON)); err != nil {
		return err
	}
	if len(removedIDs) == 0 {
		return nil
	}
	removed, err := json.Marshal(removedIDs)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO sync_removed_projects(id) SELECT value FROM json_each(?)`, string(removed)); err != nil {
		return err
	}
	if err := suppressSyncTriggers(ctx, tx, true); err != nil {
		return err
	}
	// Removing a classification from an applied Project deletion is a local
	// projection of the collection, independent of the task's cloud version.
	if _, err := tx.ExecContext(ctx, `
		UPDATE tasks SET version=version+1,
		   document=json_set(json_remove(document,'$.project_id'),'$.version',version+1)
		WHERE json_extract(document,'$.project_id') IN (SELECT value FROM json_each(?))`, string(removed)); err != nil {
		return err
	}
	return suppressSyncTriggers(ctx, tx, false)
}
