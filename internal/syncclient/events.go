package syncclient

import (
	"context"
	"encoding/json"
	"math/rand/v2"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

func signalRemote(remote chan<- struct{}) {
	select {
	case remote <- struct{}{}:
	default:
	}
}

func (r *Runner) watchEvents(ctx context.Context, connected *atomic.Bool, remote chan<- struct{}) {
	delay := time.Second
	for ctx.Err() == nil {
		r.readEvents(ctx, func() {
			connected.Store(true)
			delay = time.Second
			signalRemote(remote)
		}, remote)
		if connected.Swap(false) {
			signalRemote(remote)
		}
		// Jitter reconnections after a Worker deployment or network outage.
		timer := time.NewTimer(delay + rand.N(delay/2))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			delay = min(2*delay, time.Minute)
		}
	}
}

func (r *Runner) readEvents(ctx context.Context, onConnect func(), remote chan<- struct{}) {
	auth, err := r.credentials(ctx)
	if err != nil {
		return
	}
	headers := http.Header{}
	headers.Set(accountHeader, r.account)
	auth.setHeaders(headers)
	url := *r.endpoint
	url.Path = "/api/sync/events"
	url.Scheme = "wss"
	if r.endpoint.Scheme == "http" {
		url.Scheme = "ws"
	}
	socket, response, err := websocket.Dial(ctx, url.String(), &websocket.DialOptions{
		HTTPClient: r.http,
		HTTPHeader: headers,
	})
	if err != nil {
		return
	}
	defer socket.CloseNow()
	if response.Header.Get(accountHeader) != r.account {
		return
	}

	socket.SetReadLimit(1024)
	onConnect()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				pingCtx, stop := context.WithTimeout(ctx, 10*time.Second)
				err := socket.Ping(pingCtx)
				stop()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()

	for ctx.Err() == nil {
		_, raw, err := socket.Read(ctx)
		if err != nil {
			return
		}
		var event struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(raw, &event) == nil && (event.Type == "tasks" || event.Type == "collections") {
			signalRemote(remote)
		}
	}
}
