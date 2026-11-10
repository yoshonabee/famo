//go:build darwin && !ios

package desktop

import (
	"os"
	"path/filepath"
	"testing"
)

func TestThemeExportReplacementAndFailureCleanup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "theme.json")
	if err := os.WriteFile(path, []byte(`{"version":0}`), 0600); err != nil {
		t.Fatal(err)
	}
	contents := `{"format":"famo-theme","version":1,"themes":[]}`
	if err := writeThemeExport(path, contents); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != contents {
		t.Fatalf("export was not completely replaced: %s, %v", got, err)
	}
	// A failed replacement must leave the existing destination intact and
	// remove the temporary file used for the attempted export.
	if err := writeThemeExport(dir, contents); err == nil {
		t.Fatal("export unexpectedly replaced a directory")
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 || entries[0].Name() != "theme.json" {
		t.Fatalf("failed export left temporary files: %v, %v", entries, err)
	}
	got, err = os.ReadFile(path)
	if err != nil || string(got) != contents {
		t.Fatal("failed export damaged an existing export")
	}
}

func TestThemeExportRejectsInvalidContentsBeforeOpeningDialog(t *testing.T) {
	files := &ThemeFiles{}
	for _, contents := range []string{"invalid JSON", string(make([]byte, (1<<20)+1))} {
		if saved, err := files.Export(contents, "theme.json"); err == nil || saved {
			t.Fatal("invalid export was accepted")
		}
	}
}
