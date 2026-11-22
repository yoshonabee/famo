package syncclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"famo/internal/tasks"
)

const collectionsPath = "/api/sync/collections"

func (r *Runner) syncCollections(ctx context.Context, auth credentials) error {
	resp, err := r.request(ctx, auth, http.MethodGet, collectionsPath, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	// The original task-only Worker denies service clients on unknown paths.
	if resp.StatusCode == http.StatusNotFound ||
		(resp.StatusCode == http.StatusForbidden && resp.Header.Get(accountHeader) == "") {
		return nil
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("sync Project and Board pull returned HTTP %d", resp.StatusCode)
	}
	var remote tasks.SyncCollections
	if err := readResponse(resp.Body, &remote); err != nil {
		return err
	}
	op, changed, err := r.store.PrepareCollectionSync(ctx, remote)
	if err != nil {
		return err
	}
	if changed && r.onTasksChanged != nil {
		r.onTasksChanged()
	}
	if op == nil {
		return nil
	}
	return r.pushCollection(ctx, auth, *op)
}

func (r *Runner) pushCollection(ctx context.Context, auth credentials, op tasks.CollectionOperation) error {
	raw, err := json.Marshal(op)
	if err != nil {
		return err
	}
	resp, err := r.request(ctx, auth, http.MethodPost, collectionsPath, raw)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
		var remote tasks.SyncCollections
		if err := readResponse(resp.Body, &remote); err != nil {
			return err
		}
		if err := r.store.ConfirmCollectionSync(ctx, op, remote); err != nil {
			return err
		}
		if r.onTasksChanged != nil {
			r.onTasksChanged()
		}
		return nil
	case http.StatusConflict:
		var conflict struct {
			Current tasks.SyncCollections `json:"current"`
		}
		if err := readResponse(resp.Body, &conflict); err != nil {
			return err
		}
		return r.store.ConflictCollectionSync(ctx, op, conflict.Current)
	case http.StatusBadRequest, http.StatusRequestEntityTooLarge, http.StatusUnprocessableEntity:
		if resp.Header.Get(accountHeader) == r.account {
			return r.store.RejectCollectionSync(ctx, op, resp.StatusCode)
		}
	}
	return fmt.Errorf("sync Project and Board push returned HTTP %d", resp.StatusCode)
}
