//go:build darwin

package syncclient

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

func accessCredential(ctx context.Context, service, account string) (string, error) {
	data, err := exec.CommandContext(ctx, "/usr/bin/security", "find-generic-password", "-s", service, "-a", account, "-w").Output()
	if err != nil || strings.TrimSpace(string(data)) == "" {
		return "", fmt.Errorf("unable to read %q for account %q from macOS Keychain", service, account)
	}
	return strings.TrimSpace(string(data)), nil
}
