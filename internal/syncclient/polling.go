package syncclient

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

const (
	syncSoon              = 250 * time.Millisecond
	pushSoon              = time.Second
	connectedSyncInterval = 15 * time.Minute
)

// Activity tracks interaction with Famo and successful local writes.
type Activity struct {
	mu            sync.Mutex
	last          time.Time
	idleAfter     time.Duration
	requested     chan struct{}
	pushRequested chan struct{}
	pushAt        time.Time
}

func NewActivity(idleAfter time.Duration) *Activity {
	return &Activity{
		last:          time.Now(),
		idleAfter:     idleAfter,
		requested:     make(chan struct{}, 1),
		pushRequested: make(chan struct{}, 1),
	}
}

// Interacted extends the active period and requests sync when resuming from idle.
func (a *Activity) Interacted() { a.mark(false) }

// RequestRefresh catches up when the desktop window becomes active.
func (a *Activity) RequestRefresh() { a.mark(true) }

// LocalWrite starts a fixed upload window at the first write of a burst.
func (a *Activity) LocalWrite() { a.schedulePush(pushSoon) }

// RequestSync ends the upload window early for a manual sync.
func (a *Activity) RequestSync() { a.schedulePush(0) }

func (a *Activity) schedulePush(delay time.Duration) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.last = time.Now()
	if delay == 0 || a.pushAt.IsZero() {
		a.pushAt = a.last.Add(delay)
		select {
		case a.pushRequested <- struct{}{}:
		default:
		}
	}
}

func (a *Activity) pushDeadline() time.Time {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.pushAt
}

func (a *Activity) takeReadyPush() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if time.Now().Before(a.pushAt) {
		return false
	}
	a.pushAt = time.Time{}
	return true
}

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

func runPolling(
	ctx context.Context,
	interval time.Duration,
	activity *Activity,
	connected *atomic.Bool,
	remote <-chan struct{},
	syncOnce func(pushReady bool) time.Duration,
) {
	var requests, pushRequests <-chan struct{}
	if activity != nil {
		requests = activity.requested
		pushRequests = activity.pushRequested
	}
	timer := time.NewTimer(0)
	defer timer.Stop()
	pushTimer := time.NewTimer(pushSoon)
	pushTimer.Stop()
	defer pushTimer.Stop()
	requested := false
	remoteRequested := false
	for ctx.Err() == nil {
		select {
		case <-ctx.Done():
			return
		case <-remote:
			remoteRequested = true
			if !requested {
				requested = true
				timer.Reset(min(interval, syncSoon))
			}
			continue
		case <-requests:
			if !requested {
				// Coalesce bursts without postponing the first requested sync.
				requested = true
				timer.Reset(min(interval, syncSoon))
			}
			continue
		case <-pushRequests:
			if deadline := activity.pushDeadline(); !deadline.IsZero() {
				pushTimer.Reset(time.Until(deadline))
			}
			continue
		case <-pushTimer.C:
		case <-timer.C:
		}
		requested = false
		if ctx.Err() != nil {
			return
		}
		if !remoteRequested && !connected.Load() && activity != nil && !activity.active() {
			continue
		}
		remoteRequested = false
		select {
		case <-requests:
		default:
		}
		pushReady := activity == nil || activity.takeReadyPush()
		if pushReady {
			pushTimer.Stop()
		}
		delay := syncOnce(pushReady)
		if delay == 0 {
			delay = interval
			if connected.Load() {
				delay = connectedSyncInterval
			}
		}
		timer.Reset(delay)
	}
}
