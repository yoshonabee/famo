package syncclient

import (
	"context"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"
)

func TestPollingPausesAndResumesWithActivity(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		activity := NewActivity(5 * time.Minute)
		var calls atomic.Int32
		go runPolling(ctx, 30*time.Second, activity, &atomic.Bool{}, nil, func() time.Duration { calls.Add(1); return 0 })
		assertCalls := func(want int32) {
			t.Helper()
			synctest.Wait()
			if got := calls.Load(); got != want {
				t.Fatalf("sync ran %d times, want %d", got, want)
			}
		}

		assertCalls(1)
		time.Sleep(4 * time.Minute)
		assertCalls(9)
		activity.Interacted()
		assertCalls(9)
		time.Sleep(5 * time.Minute)
		assertCalls(18)
		time.Sleep(time.Hour)
		assertCalls(18)

		activity.Interacted()
		time.Sleep(syncSoon)
		assertCalls(19)
		time.Sleep(30 * time.Second)
		assertCalls(20)
	})
}

func TestPollingCoalescesRequestsAndKeepsWritesDuringSync(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		activity := NewActivity(5 * time.Minute)
		var calls atomic.Int32
		var writeDuringSync atomic.Bool
		go runPolling(ctx, 30*time.Second, activity, &atomic.Bool{}, nil, func() time.Duration {
			calls.Add(1)
			if writeDuringSync.Swap(false) {
				activity.RequestSync()
			}
			return 0
		})

		time.Sleep(time.Minute * 5)
		synctest.Wait()
		before := calls.Load()
		writeDuringSync.Store(true)
		for range 3 {
			activity.RequestSync()
		}
		time.Sleep(syncSoon)
		synctest.Wait()
		if got := calls.Load() - before; got != 1 {
			t.Fatalf("expected one immediate sync, got %d", got)
		}
		// The write queued during sync must get its own cycle.
		time.Sleep(syncSoon)
		synctest.Wait()
		if got := calls.Load() - before; got != 2 {
			t.Fatalf("expected the later write to schedule sync, got %d", got)
		}
	})
}

func TestConnectedSyncReceivesEventsWhileIdleAndResumesFallback(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		activity := NewActivity(time.Minute)
		var calls atomic.Int32
		var connected atomic.Bool
		connected.Store(true)
		remote := make(chan struct{}, 1)
		go runPolling(ctx, 30*time.Second, activity, &connected, remote, func() time.Duration {
			calls.Add(1)
			return 0
		})
		time.Sleep(2 * time.Minute)
		synctest.Wait()
		if got := calls.Load(); got != 1 {
			t.Fatalf("connected client polled during idle: %d cycles", got)
		}

		signalRemote(remote)
		time.Sleep(syncSoon)
		synctest.Wait()
		if got := calls.Load(); got != 2 {
			t.Fatalf("remote change did not wake the idle client: %d cycles", got)
		}

		connected.Store(false)
		signalRemote(remote)
		time.Sleep(syncSoon)
		synctest.Wait()
		activity.Interacted()
		time.Sleep(time.Minute - time.Second)
		synctest.Wait()
		if got := calls.Load(); got != 5 {
			t.Fatalf("polling did not resume on activity: %d cycles", got)
		}
	})
}
