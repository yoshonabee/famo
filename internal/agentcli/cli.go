package agentcli

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"famo/internal/agent"
)

//go:embed famo/SKILL.md
var skill string

type task struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	ScheduledDate string     `json:"scheduled_date"`
	CompletedAt   *time.Time `json:"completed_at"`
	Version       int        `json:"version"`
	Links         []struct {
		URL string `json:"url"`
	} `json:"links"`
}

type action struct {
	Op          string              `json:"op"`
	Version     int                 `json:"version"`
	Source      string              `json:"source"`
	Description *string             `json:"description,omitempty"`
	Links       []map[string]string `json:"links,omitempty"`
}

const usage = `Usage: famo-agent [--api-info PATH | --url URL] COMMAND
  today [--date YYYY-MM-DD]              List unfinished tasks and workspace
  context ID                             Read a task and its workspace
  add --title TEXT [--date YYYY-MM-DD]    Create a task (undated by default)
  update ID --version N [--description TEXT] [--link URL]...
                                         Update notes or append links
  complete ID --version N                Mark a task complete
  cli install | uninstall                 Manage the command in ~/.local/bin
  skill install [--dir DIR]               Install the Famo skill
`

const source = "agent:famo-cli"

func Run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	result, err := run(ctx, args)
	if errors.Is(err, flag.ErrHelp) {
		fmt.Fprint(stdout, usage)
		return 0
	}
	if err == nil {
		if result == nil {
			return 0
		}
		if err = json.NewEncoder(stdout).Encode(result); err == nil {
			return 0
		}
	}
	var response *responseError
	if errors.As(err, &response) {
		_ = json.NewEncoder(stderr).Encode(response)
		if response.Status == 409 {
			return 3
		}
	} else {
		_ = json.NewEncoder(stderr).Encode(map[string]string{"error": err.Error()})
	}
	return 1
}

func run(ctx context.Context, args []string) (any, error) {
	flags := commandFlags(agent.CLIName)
	directURL := flags.String("url", "", "explicit loopback API URL")
	infoPath := flags.String("api-info", "", "desktop API discovery file")
	if err := flags.Parse(args); err != nil {
		return nil, err
	}
	args = flags.Args()
	if len(args) == 0 {
		return nil, flag.ErrHelp
	}
	command, args := args[0], args[1:]
	switch command {
	case "help":
		return nil, flag.ErrHelp
	case "cli":
		return installCLI(args)
	case "skill":
		return installSkill(args)
	case "today", "context", "add", "update", "complete":
		if len(args) == 1 && (args[0] == "-h" || args[0] == "--help") {
			return nil, flag.ErrHelp
		}
		c, err := connect(ctx, *directURL, *infoPath)
		if err != nil {
			return nil, err
		}
		defer c.http.CloseIdleConnections()
		return runTaskCommand(ctx, c, command, args)
	default:
		return nil, fmt.Errorf("unknown command %q. Run famo-agent --help", command)
	}
}

func runTaskCommand(ctx context.Context, c *client, command string, args []string) (any, error) {
	flags := commandFlags(command)
	switch command {
	case "today":
		date := flags.String("date", time.Now().Format(time.DateOnly), "date in local time")
		if err := parseFlags(flags, args); err != nil {
			return nil, err
		}
		if _, err := time.Parse(time.DateOnly, *date); err != nil || strings.HasPrefix(*date, "0000-") {
			return nil, errors.New("date must be a valid YYYY-MM-DD")
		}
		workspace, err := readWorkspace(ctx, c)
		if err != nil {
			return nil, err
		}
		tasks, err := call[[]task](ctx, c, "/tasks", nil)
		if err != nil {
			return nil, err
		}
		today := make([]task, 0)
		for _, task := range tasks {
			if task.ScheduledDate == *date && task.CompletedAt == nil {
				today = append(today, task)
			}
		}
		return struct {
			Date      string          `json:"date"`
			Workspace agent.Workspace `json:"workspace"`
			Tasks     []task          `json:"tasks"`
		}{*date, workspace, today}, nil
	case "context":
		if len(args) != 1 || args[0] == "" || strings.HasPrefix(args[0], "-") {
			return nil, errors.New("usage: famo-agent context ID")
		}
		current, err := call[task](ctx, c, taskPath(args[0])+"/context", nil)
		if err != nil {
			return nil, err
		}
		workspace, err := readWorkspace(ctx, c)
		if err != nil {
			return nil, err
		}
		return struct {
			Task      task            `json:"task"`
			Workspace agent.Workspace `json:"workspace"`
		}{current, workspace}, nil
	case "add":
		title := flags.String("title", "", "task title")
		date := flags.String("date", "", "scheduled date")
		if err := parseFlags(flags, args); err != nil {
			return nil, err
		}
		if strings.TrimSpace(*title) == "" {
			return nil, errors.New("add requires --title")
		}
		return call[task](ctx, c, "/tasks", map[string]string{
			"title": *title, "scheduled_date": *date, "source": source,
		})
	case "update", "complete":
		if len(args) == 0 || args[0] == "" || strings.HasPrefix(args[0], "-") {
			return nil, fmt.Errorf("%s requires a task ID before its flags", command)
		}
		a := action{Op: "complete_task", Source: source}
		flags.IntVar(&a.Version, "version", 0, "current task version")
		if command == "update" {
			a.Op = "update"
			flags.Func("description", "replace task notes (empty clears notes)", func(value string) error {
				a.Description = &value
				return nil
			})
			flags.Func("link", "append URL (repeatable)", func(value string) error {
				a.Links = append(a.Links, map[string]string{"url": value})
				return nil
			})
		}
		if err := parseFlags(flags, args[1:]); err != nil {
			return nil, err
		}
		if a.Version < 1 {
			return nil, errors.New("provide the current task version with --version")
		}
		if command == "update" && a.Description == nil && len(a.Links) == 0 {
			return nil, errors.New("update requires --description or --link")
		}
		return call[task](ctx, c, taskPath(args[0])+"/actions", a)
	}
	return nil, fmt.Errorf("unknown task command %q", command)
}

func taskPath(id string) string { return "/tasks/" + url.PathEscape(id) }

func readWorkspace(ctx context.Context, c *client) (agent.Workspace, error) {
	return call[agent.Workspace](ctx, c, "/agent/workspace", nil)
}

func commandFlags(name string) *flag.FlagSet {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	return flags
}

func parseFlags(flags *flag.FlagSet, args []string) error {
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected argument %q", flags.Arg(0))
	}
	return nil
}

func installCLI(args []string) (any, error) {
	if len(args) != 1 || (args[0] != "install" && args[0] != "uninstall") {
		return nil, errors.New("usage: famo-agent cli install | uninstall")
	}
	paths, err := agent.UserCLIPaths()
	if err != nil {
		return nil, err
	}
	install := args[0] == "install"
	if install {
		executable, err := os.Executable()
		if err != nil {
			return nil, err
		}
		if err := paths.Install(executable); err != nil {
			return nil, err
		}
	} else if err := paths.Remove(); err != nil {
		return nil, err
	}
	return struct {
		Path      string `json:"path"`
		Installed bool   `json:"installed"`
	}{paths.Command, install}, nil
}

func installSkill(args []string) (any, error) {
	if len(args) == 0 || args[0] != "install" {
		return nil, errors.New("usage: famo-agent skill install [--dir DIR]")
	}
	flags := commandFlags("skill install")
	dir := flags.String("dir", "", "skills directory of the local agent")
	if err := parseFlags(flags, args[1:]); err != nil {
		return nil, err
	}
	if *dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		*dir = filepath.Join(home, ".agents", "skills")
	}
	path, err := filepath.Abs(filepath.Join(*dir, "famo", "SKILL.md"))
	if err != nil {
		return nil, err
	}
	if err := agent.InstallFile(path, 0644, strings.NewReader(skill)); err != nil {
		return nil, err
	}
	return map[string]string{"path": path}, nil
}
