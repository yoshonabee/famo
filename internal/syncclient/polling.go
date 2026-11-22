package syncclient

import (
	"context"
	"sync"
	"time"
)

const syncSoon = 250 * time.Millisecond

// Activity tracks interaction with Famo and successful local writes.
type Activity struct {
	mu        sync.Mutex
	last      time.Time
	idleAfter time.Duration
	requested chan struct{}
}

func NewActivity(idleAfter time.Duration) *Activity {
	return &Activity{
		last: time.Now(), idleAfter: idleAfter, requested: make(chan struct{}, 1),
	}
}

// Interacted extends the active period and requests sync when resuming from idle.
func (a *Activity) Interacted() { a.mark(false) }

// RequestSync extends the active period and requests sync after a short delay.
func (a *Activity) RequestSync() { a.mark(true) }

func (a *Activity) mark(request bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	if request || now.Sub(a.last) >= a.idleAfter {
		select {
		case a.requested <- struct{}{}:
		default:
		}
	}
	a.last = now
}

func (a *Activity) active() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return time.Since(a.last) < a.idleAfter
}

func runPolling(ctx context.Context, interval time.Duration, activity *Activity, syncOnce func()) {
	var requests <-chan struct{}
	if activity != nil {
		requests = activity.requested
	}
	timer := time.NewTimer(0)
	defer timer.Stop()
	requested := false
	for ctx.Err() == nil {
		select {
		case <-ctx.Done():
			return
		case <-requests:
			if !requested {
				// Coalesce bursts without postponing the first requested sync.
				requested = true
				timer.Reset(min(interval, syncSoon))
			}
		case <-timer.C:
			requested = false
			if ctx.Err() != nil {
				return
			}
			if activity != nil && !activity.active() {
				continue
			}
			select {
			case <-requests:
			default:
			}
			syncOnce()
			timer.Reset(interval)
		}
	}
}
