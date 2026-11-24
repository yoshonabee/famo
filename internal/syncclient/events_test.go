package syncclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestReadEventsAuthenticatesAndSignalsAnUpdate(t *testing.T) {
	runner, _ := testRunner(t)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/sync/events" ||
			r.Header.Get("Authorization") != "Bearer local-test-token" ||
			r.Header.Get(accountHeader) != "personal" {
			t.Error("WebSocket handshake omitted the sync account or credentials")
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set(accountHeader, "personal")
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Errorf("accept WebSocket: %v", err)
			return
		}
		defer conn.CloseNow()
		if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"tasks","sequence":1}`)); err != nil {
			t.Errorf("send notification: %v", err)
		}
	}))
	defer server.Close()
	endpoint, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	runner.endpoint = endpoint

	connected := make(chan struct{})
	updates := make(chan struct{}, 1)
	done := make(chan struct{})
	go func() {
		defer close(done)
		runner.readEvents(ctx, func() { close(connected) }, updates)
	}()
	defer func() {
		cancel()
		<-done
	}()
	select {
	case <-updates:
		<-connected
	case <-ctx.Done():
		t.Fatal("sync did not receive the WebSocket update")
	}
}
