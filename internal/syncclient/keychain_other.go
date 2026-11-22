//go:build !darwin

package syncclient

import (
	"context"
	"errors"
)

func accessCredential(context.Context, string, string) (string, error) {
	return "", errors.New("Cloudflare Access service credentials require macOS Keychain")
}
