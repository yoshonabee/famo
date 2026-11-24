package syncclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"famo/internal/tasks"
)

const accountHeader = "X-Famo-Sync-Account"

type Runner struct {
	store          *tasks.Store
	endpoint       *url.URL
	account        string
	interval       time.Duration
	http           *http.Client
	onTasksChanged func()
	access         credentials
	accessMu       sync.Mutex
}

type credentials struct {
	localToken   string
	clientID     string
	clientSecret string
}

func New(ctx context.Context, store *tasks.Store, cfg Config, onTasksChanged func()) (*Runner, error) {
	endpoint, interval, err := cfg.validate()
	if err != nil {
		return nil, err
	}
	if err := store.BindSync(ctx, endpoint.String(), cfg.Account); err != nil {
		return nil, err
	}
	return &Runner{
		store: store, endpoint: endpoint, account: cfg.Account, interval: interval, onTasksChanged: onTasksChanged,
		http: &http.Client{
			Timeout: 15 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}, nil
}

// Run keeps sync enabled continuously for headless callers.
func (r *Runner) Run(ctx context.Context, report func(error)) {
	r.RunWhileActive(ctx, nil, report, nil)
}

// RunWhileActive pauses fallback polling while the desktop is idle.
func (r *Runner) RunWhileActive(ctx context.Context, activity *Activity, report func(error), update func(Status)) {
	var previous string
	var connected atomic.Bool
	remote := make(chan struct{}, 1)
	go r.watchEvents(ctx, &connected, remote)
	runPolling(ctx, r.interval, activity, &connected, remote, func() time.Duration {
		if update != nil {
			update(StatusSyncing)
		}
		more, err := r.sync(ctx)
		if ctx.Err() != nil {
			return 0
		}
		if update != nil {
			update(cycleStatus(more, err))
		}
		if err != nil && err.Error() != previous {
			report(err)
			previous = err.Error()
		} else if err == nil {
			previous = ""
		}
		if err != nil {
			return r.interval
		}
		if more {
			return syncSoon
		}
		return 0
	})
}

func (r *Runner) credentials(ctx context.Context) (credentials, error) {
	r.accessMu.Lock()
	defer r.accessMu.Unlock()
	if isLoopback(r.endpoint.Hostname()) {
		token := os.Getenv("FAMO_SYNC_LOCAL_TOKEN")
		if token == "" {
			return credentials{}, errors.New("FAMO_SYNC_LOCAL_TOKEN is required for loopback sync")
		}
		return credentials{localToken: token}, nil
	}
	if r.access.clientID != "" {
		return r.access, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	service := "Famo Sync " + r.endpoint.String()
	clientID, err := accessCredential(ctx, service+" Client ID", r.account)
	if err != nil {
		return credentials{}, err
	}
	secret, err := accessCredential(ctx, service+" Client Secret", r.account)
	if err != nil {
		return credentials{}, err
	}
	r.access = credentials{clientID: clientID, clientSecret: secret}
	return r.access, nil
}

func (r *Runner) Sync(ctx context.Context) error {
	_, err := r.sync(ctx)
	return err
}

func (r *Runner) sync(ctx context.Context) (bool, error) {
	auth, err := r.credentials(ctx)
	if err != nil {
		return false, err
	}
	collectionsErr := r.syncCollections(ctx, auth)
	moreWrites, pushErr := r.push(ctx, auth)
	more, pullErr := r.pull(ctx, auth)
	return more || moreWrites, errors.Join(collectionsErr, pushErr, pullErr)
}

// Limit work per poll so a large outbox does not starve remote changes.
func (r *Runner) push(ctx context.Context, auth credentials) (bool, error) {
	for range 10 {
		ops, err := r.store.SyncOperations(ctx, 10)
		if err != nil || len(ops) == 0 {
			return false, err
		}
		for _, op := range ops {
			if err := r.pushOperation(ctx, auth, op); err != nil {
				return false, err
			}
		}
	}
	return true, nil
}

func (r *Runner) pushOperation(ctx context.Context, auth credentials, op tasks.SyncOperation) error {
	raw, err := json.Marshal(op)
	if err != nil {
		return err
	}
	resp, err := r.request(ctx, auth, http.MethodPost, "/api/sync/push", raw)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
		var body struct {
			Change tasks.SyncChange `json:"change"`
		}
		if err := readResponse(resp.Body, &body); err != nil {
			return err
		}
		if body.Change.Sequence < 1 || body.Change.Task.ID != op.TaskID || body.Change.Task.Version != op.Task.Version {
			return errors.New("malformed sync push acknowledgement")
		}
		changed, err := r.store.AcknowledgeSync(ctx, op)
		if changed && r.onTasksChanged != nil {
			r.onTasksChanged()
		}
		return err
	case http.StatusConflict:
		var body struct {
			Current json.RawMessage `json:"current"`
		}
		if err := readResponse(resp.Body, &body); err != nil {
			return err
		}
		var current *tasks.Task
		if err := json.Unmarshal(body.Current, &current); err != nil {
			return fmt.Errorf("malformed sync conflict: %w", err)
		}
		if current != nil && (current.ID != op.TaskID || current.Version < 1) {
			return errors.New("malformed sync conflict")
		}
		return r.store.RecordSyncConflict(ctx, op, current)
	case http.StatusBadRequest, http.StatusRequestEntityTooLarge, http.StatusUnprocessableEntity:
		if resp.Header.Get(accountHeader) == r.account {
			return r.store.RecordSyncRejection(ctx, op, resp.StatusCode)
		}
	}
	return fmt.Errorf("sync push for task %s returned HTTP %d", op.TaskID, resp.StatusCode)
}

func (r *Runner) pull(ctx context.Context, auth credentials) (bool, error) {
	cursor, err := r.store.SyncCursor(ctx)
	if err != nil {
		return false, err
	}
	for range 10 {
		next, more, err := r.pullPage(ctx, auth, cursor)
		if err != nil || !more {
			return false, err
		}
		cursor = next
	}
	return true, nil
}

func (r *Runner) pullPage(ctx context.Context, auth credentials, cursor int64) (int64, bool, error) {
	resp, err := r.request(ctx, auth, http.MethodGet, "/api/sync/pull?after="+strconv.FormatInt(cursor, 10), nil)
	if err != nil {
		return 0, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, false, fmt.Errorf("sync pull returned HTTP %d", resp.StatusCode)
	}
	var body struct {
		Changes []tasks.SyncChange `json:"changes"`
		Cursor  int64              `json:"cursor"`
		HasMore bool               `json:"has_more"`
	}
	if err := readResponse(resp.Body, &body); err != nil {
		return 0, false, err
	}
	last := cursor
	for _, change := range body.Changes {
		if change.Sequence <= last || change.Task.Version < 1 || change.Task.ID == "" || change.Task.CreatedAt.IsZero() || change.Task.UpdatedAt.IsZero() {
			return 0, false, errors.New("malformed sync change")
		}
		last = change.Sequence
	}
	if body.Cursor != last || (body.HasMore && last == cursor) {
		return 0, false, errors.New("malformed sync cursor")
	}
	changed, err := r.store.ApplySyncChanges(ctx, body.Changes, last)
	if err != nil {
		return 0, false, err
	}
	if changed && r.onTasksChanged != nil {
		r.onTasksChanged()
	}
	return last, body.HasMore, nil
}

func (r *Runner) request(ctx context.Context, auth credentials, method, path string, raw []byte) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, r.endpoint.String()+path, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set(accountHeader, r.account)
	if raw != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	auth.setHeaders(req.Header)
	resp, err := r.http.Do(req)
	if err != nil {
		return nil, err
	}
	if (resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusConflict) &&
		resp.Header.Get(accountHeader) != r.account {
		resp.Body.Close()
		return nil, errors.New("sync response account does not match configured account")
	}
	return resp, nil
}

func (auth credentials) setHeaders(headers http.Header) {
	if auth.localToken != "" {
		headers.Set("Authorization", "Bearer "+auth.localToken)
	} else {
		headers.Set("CF-Access-Client-Id", auth.clientID)
		headers.Set("CF-Access-Client-Secret", auth.clientSecret)
	}
}

func readResponse(reader io.Reader, value any) error {
	const maxSyncResponse = 8 << 20
	raw, err := io.ReadAll(io.LimitReader(reader, maxSyncResponse+1))
	if err != nil {
		return err
	}
	if len(raw) > maxSyncResponse {
		return errors.New("sync response exceeds size limit")
	}
	if err := json.Unmarshal(raw, value); err != nil {
		return fmt.Errorf("decode sync response: %w", err)
	}
	return nil
}
