package agent

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const CLIName = "famo-agent"

type CLIPaths struct {
	Command    string
	Executable string
}

func UserCLIPaths() (CLIPaths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return CLIPaths{}, err
	}
	info, err := DefaultAPIInfoPath()
	if err != nil {
		return CLIPaths{}, err
	}
	return CLIPaths{
		Command:    filepath.Join(home, ".local", "bin", CLIName),
		Executable: filepath.Join(filepath.Dir(info), "bin", CLIName),
	}, nil
}

func (p CLIPaths) Owned() (bool, error) {
	target, err := os.Readlink(p.Command)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil || target != p.Executable {
		return false, fmt.Errorf("%s 已存在，請先移開原有指令", p.Command)
	}
	return true, nil
}

func (p CLIPaths) Install(source string) error {
	owned, err := p.Owned()
	if err != nil {
		return err
	}
	binary, err := os.Open(source)
	if err != nil {
		return err
	}
	defer binary.Close()
	if err := InstallFile(p.Executable, 0755, binary); err != nil {
		return err
	}
	if owned {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(p.Command), 0755); err != nil {
		return err
	}
	if err := os.Symlink(p.Executable, p.Command); err != nil {
		if owned, _ := p.Owned(); !owned {
			return err
		}
	}
	return nil
}

func (p CLIPaths) Remove() error {
	owned, err := p.Owned()
	if err != nil || !owned {
		return err
	}
	if err := os.Remove(p.Command); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Remove(p.Executable); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func InstallFile(path string, mode os.FileMode, contents io.Reader) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".famo-install-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := io.Copy(file, contents); err != nil {
		return err
	}
	if err := file.Chmod(mode); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
