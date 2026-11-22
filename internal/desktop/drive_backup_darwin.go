//go:build darwin && !ios

package desktop

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// DriveBackup is only bound to the native desktop UI, outside the Agent API.
type DriveBackup struct {
	dbPath string
	client driveClient
	mu     sync.Mutex
}

var errDriveBusy = errors.New("Google Drive 正在處理另一項操作")

func (*DriveBackup) Connected() (bool, error) {
	credentials, err := loadDriveCredentials()
	return credentials.RefreshToken != "", err
}

func (b *DriveBackup) Connect(ctx context.Context) (bool, error) {
	if !b.mu.TryLock() {
		return false, errDriveBusy
	}
	defer b.mu.Unlock()
	app := application.Get()
	dialog := app.Dialog.OpenFile().
		SetTitle("選擇 Google 桌面 OAuth 用戶端 JSON").
		AddFilter("OAuth 用戶端 JSON", "*.json").
		CanChooseFiles(true)
	if window, ok := app.Window.GetByName("famo"); ok {
		dialog.AttachToWindow(window)
	}
	path, err := dialog.PromptForSingleSelection()
	if err != nil || path == "" {
		return false, err
	}
	credentials, err := readDriveCredentials(path)
	if err != nil {
		return false, err
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	credentials, err = b.client.authorize(ctx, credentials, app.Browser.OpenURL)
	if err != nil {
		return false, err
	}
	if ctx.Err() != nil {
		return false, driveContextError(ctx)
	}
	if err := saveDriveCredentials(credentials); err != nil {
		return false, err
	}
	return true, nil
}

func (b *DriveBackup) Disconnect() error {
	if !b.mu.TryLock() {
		return errDriveBusy
	}
	defer b.mu.Unlock()
	return clearDriveCredentials()
}

func (b *DriveBackup) Backup(ctx context.Context) (DriveBackupResult, error) {
	if !b.mu.TryLock() {
		return DriveBackupResult{}, errDriveBusy
	}
	defer b.mu.Unlock()
	credentials, err := loadDriveCredentials()
	if err != nil {
		return DriveBackupResult{}, err
	}
	if credentials.RefreshToken == "" {
		return DriveBackupResult{}, errors.New("請先授權 Famo 存取 Google Drive")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	token, err := b.client.refresh(ctx, credentials)
	if err != nil {
		return DriveBackupResult{}, err
	}
	if token.RefreshToken != "" && token.RefreshToken != credentials.RefreshToken {
		credentials.RefreshToken = token.RefreshToken
		if err := saveDriveCredentials(credentials); err != nil {
			return DriveBackupResult{}, err
		}
	}
	return b.client.backup(ctx, token, b.dbPath)
}
