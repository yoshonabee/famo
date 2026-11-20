//go:build darwin && !ios

package desktop

import (
	"context"
	_ "embed"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Monochrome template of web/public/famo-mark.svg for both macOS appearances.
//
//go:embed menu-bar-template.png
var menuBarIcon []byte

// MenuBar connects the panel's Board selection to the native tray and window.
type MenuBar struct {
	boardID atomic.Value
	refresh chan struct{}
}

func (m *MenuBar) SelectBoard(id string) {
	if m.boardID.Swap(id) != id {
		select {
		case m.refresh <- struct{}{}:
		default:
		}
	}
}

func (m *MenuBar) selectedBoardID() string {
	id, _ := m.boardID.Load().(string)
	return id
}

func (*MenuBar) OpenFamo(boardID string) {
	if window := showFamo(); window != nil {
		window.EmitEvent("famo:open-board", boardID)
	}
}

func showFamo() application.Window {
	app := application.Get()
	if panel, ok := app.Window.GetByName("menu-bar"); ok {
		panel.Hide()
	}
	if window, ok := app.Window.GetByName("famo"); ok {
		window.Show()
		window.UnMinimise()
		window.Focus()
		return window
	}
	return nil
}

func setupMenuBar(app *application.App, backend *Backend, menuBar *MenuBar) {
	panel := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "menu-bar", Title: "Famo 今日任務", URL: "/menu-bar.html",
		Width: 360, Height: 480, Frameless: true, AlwaysOnTop: true,
		// Escape is handled in the WebView so it can dismiss an open Board menu first.
		Hidden: true, DisableResize: true, HideOnFocusLost: true,
		BackgroundColour: application.NewRGB(248, 249, 246),
		Mac: application.MacWindow{
			// Stay in the current Space, including another app's fullscreen Space,
			// without activating Famo and switching back to its main window.
			WindowClass: application.MacWindowClassPanel,
			PanelPreferences: application.MacPanelPreferences{
				NonActivating: true,
			},
			CollectionBehavior: application.MacWindowCollectionBehaviorCanJoinAllSpaces |
				application.MacWindowCollectionBehaviorFullScreenAuxiliary,
		},
	})
	panel.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		event.Cancel()
		panel.Hide()
	})
	tray := app.SystemTray.New()
	tray.SetTemplateIcon(menuBarIcon)
	tray.SetLabel("…")
	tray.SetTooltip("Famo · 今日任務")
	tray.AttachWindow(panel).WindowOffset(6)
	menu := app.NewMenu()
	menu.Add("Open Famo").OnClick(func(*application.Context) { menuBar.OpenFamo(menuBar.selectedBoardID()) })
	menu.AddSeparator()
	menu.Add("Quit Famo").OnClick(func(*application.Context) { app.Quit() })
	tray.SetMenu(menu)

	// Keep updating even when both WebViews are hidden. This also picks up Agent
	// API edits and a new local day without relying on WebView timer scheduling.
	ctx, cancel := context.WithCancel(context.Background())
	app.OnShutdown(cancel)
	app.Event.OnApplicationEvent(events.Common.ApplicationStarted, func(*application.ApplicationEvent) {
		go func() {
			ticker := time.NewTicker(2 * time.Second)
			defer ticker.Stop()
			for {
				if ctx.Err() != nil {
					return
				}
				queryCtx, queryCancel := context.WithTimeout(ctx, time.Second)
				boardID := menuBar.selectedBoardID()
				progress, err := backend.todayProgress(queryCtx, time.Now(), boardID)
				queryCancel()
				if ctx.Err() != nil {
					return
				}
				if boardID != menuBar.selectedBoardID() {
					continue
				}
				if err != nil {
					tray.SetLabel("—")
					tray.SetTooltip("Famo · 無法讀取今日進度")
				} else {
					label := progress.Label()
					tooltip := "Famo · "
					if progress.BoardName != "" {
						tooltip += progress.BoardName + " · "
					}
					tray.SetLabel(label)
					tray.SetTooltip(tooltip + "今日已完成 " + label)
				}
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
				case <-menuBar.refresh:
				}
			}
		}()
	})
}
