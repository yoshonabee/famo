//go:build darwin && !ios

package desktop

import (
	"os"
	"path/filepath"
	"strings"
	"sync"

	"famo/internal/agent"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type AgentTools struct {
	backend  *Backend
	language *DisplayLanguage
	mu       sync.Mutex
}

type AgentToolsState struct {
	APIURL       string `json:"api_url"`
	CLIInstalled bool   `json:"cli_installed"`
	CLIAvailable bool   `json:"cli_available"`
	CLIPath      string `json:"cli_path"`
	CLIError     string `json:"cli_error,omitempty"`
	SkillCommand string `json:"skill_command,omitempty"`
}

func (*AgentTools) bundledCLI() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(executable), agent.CLIName), nil
}

func (a *AgentTools) Status() (AgentToolsState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	paths, err := agent.UserCLIPaths()
	if err != nil {
		return AgentToolsState{}, err
	}
	bundled, err := a.bundledCLI()
	if err != nil {
		return AgentToolsState{}, err
	}
	bundleInfo, bundleErr := os.Stat(bundled)
	state := AgentToolsState{
		APIURL: a.backend.APIURL(), CLIPath: paths.Command,
		CLIAvailable: bundleErr == nil && bundleInfo.Mode().IsRegular(),
	}
	owned, err := paths.Owned()
	if err != nil {
		state.CLIError = err.Error()
	}
	if owned {
		info, err := os.Stat(paths.Executable)
		state.CLIInstalled = err == nil && info.Mode().IsRegular()
	}
	if state.CLIInstalled {
		state.SkillCommand = shellQuote(paths.Command) + " skill install"
	} else if state.CLIAvailable {
		state.SkillCommand = shellQuote(bundled) + " skill install"
	}
	return state, nil
}

func (a *AgentTools) SetAPIEnabled(enabled bool) error {
	return a.backend.SetAPIEnabled(enabled)
}

func (a *AgentTools) InstallCLI() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	paths, err := agent.UserCLIPaths()
	if err != nil {
		return err
	}
	bundled, err := a.bundledCLI()
	if err != nil {
		return err
	}
	return paths.Install(bundled)
}

func (a *AgentTools) RemoveCLI() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	paths, err := agent.UserCLIPaths()
	if err != nil {
		return err
	}
	return paths.Remove()
}

func (a *AgentTools) ChooseWorkspace() (string, error) {
	app := application.Get()
	dialog := app.Dialog.OpenFile().
		SetTitle(a.language.text("選擇工作區資料夾", "Choose Workspace Folder")).
		CanChooseDirectories(true).
		CanChooseFiles(false)
	if window, ok := app.Window.GetByName("famo"); ok {
		dialog.AttachToWindow(window)
	}
	return dialog.PromptForSingleSelection()
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}
