//go:build darwin && !ios

package desktop

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ThemeFiles saves exports through a native dialog; the frontend never supplies
// a destination path and the Agent HTTP API does not expose file operations.
type ThemeFiles struct{ language *DisplayLanguage }

func (f *ThemeFiles) Export(contents, filename string) (bool, error) {
	if len(contents) > 1<<20 || !json.Valid([]byte(contents)) {
		return false, fmt.Errorf("%s", f.language.text("無效的主題檔案", "Invalid theme file"))
	}
	app := application.Get()
	dialog := app.Dialog.SaveFile().
		SetFilename(filepath.Base(filename)).
		AddFilter(f.language.text("Famo 主題", "Famo Theme"), "*.json").
		CanCreateDirectories(true)
	if window, ok := app.Window.GetByName("famo"); ok {
		dialog.AttachToWindow(window)
	}
	path, err := dialog.PromptForSingleSelection()
	if err != nil || path == "" {
		return false, err
	}
	if err := writeThemeExport(path, contents); err != nil {
		return false, fmt.Errorf("%s: %w", f.language.text("無法匯出主題", "Could not export theme"), err)
	}
	return true, nil
}

func writeThemeExport(path, contents string) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".famo-theme-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.WriteString(contents); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	// Replace the destination only once the complete export has been written.
	return os.Rename(file.Name(), path)
}
