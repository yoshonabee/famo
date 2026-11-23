//go:build darwin && !ios

package desktop

import "testing"

func TestLoginItemUnavailableOutsideAppBundle(t *testing.T) {
	item := &LoginItem{}
	if status := item.Status(); status != loginItemUnavailable {
		t.Fatalf("unbundled process login item status = %q, want %q", status, loginItemUnavailable)
	}
	if err := item.SetEnabled(true); err == nil {
		t.Fatal("enabling login item from an unbundled process should fail")
	}
}
