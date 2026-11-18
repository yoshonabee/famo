package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCLIInstallReplacesOnlyManagedCommand(t *testing.T) {
	dir := t.TempDir()
	paths := CLIPaths{Command: filepath.Join(dir, "bin", CLIName), Executable: filepath.Join(dir, "app", CLIName)}
	source := filepath.Join(dir, "bundled-cli")
	if err := os.WriteFile(source, []byte("first"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(paths.Command), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(paths.Command, []byte("other installation"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := paths.Install(source); err == nil {
		t.Fatal("install replaced an unmanaged executable")
	}
	if err := paths.Remove(); err == nil {
		t.Fatal("uninstall removed an unmanaged executable")
	}
	if data, err := os.ReadFile(paths.Command); err != nil || string(data) != "other installation" {
		t.Fatalf("unmanaged command changed: %q, %v", data, err)
	}
	if err := os.Remove(paths.Command); err != nil {
		t.Fatal(err)
	}

	if err := paths.Install(source); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, []byte("updated"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := paths.Install(source); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(paths.Command); err != nil || string(data) != "updated" {
		t.Fatalf("command didn't point to updated executable: %q, %v", data, err)
	}
	if err := paths.Remove(); err != nil {
		t.Fatal(err)
	}
	if err := paths.Remove(); err != nil {
		t.Fatalf("repeat uninstall: %v", err)
	}
	if _, err := os.Lstat(paths.Command); !os.IsNotExist(err) {
		t.Fatalf("command still installed: %v", err)
	}
}
