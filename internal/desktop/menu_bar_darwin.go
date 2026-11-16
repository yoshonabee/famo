//go:build darwin && !ios

package desktop

import (
	"context"
	_ "embed"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Monochrome template of web/public/famo-mark.svg for both macOS appearances.
//
//go:embed menu-bar-template.png
var menuBarIcon []byte

// MenuBar exposes native navigation only to the desktop WebView.
type MenuBar struct{}

func (*MenuBar) OpenFamo() {
	app := application.Get()
	if panel, ok := app.Window.GetByName("menu-bar"); ok {
		panel.Hide()
	}
	if window, ok := app.Window.GetByName("famo"); ok {
		window.Show()
		window.UnMinimise()
		window.Focus()
	}
}

func setupMenuBar(app *application.App, backend *Backend) {
	panel := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "menu-bar", Title: "Famo 今日任務", URL: "/menu-bar.html",
		Width: 360, Height: 480, Frameless: true, AlwaysOnTop: true,
		Hidden: true, DisableResize: true, HideOnFocusLost: true, HideOnEscape: true,
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
	menu.Add("Open Famo").OnClick(func(*application.Context) { (&MenuBar{}).OpenFamo() })
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
				progress, err := backend.todayProgress(queryCtx, time.Now())
				queryCancel()
				if ctx.Err() != nil {
					return
				}
				if err != nil {
					tray.SetLabel("—")
					tray.SetTooltip("Famo · 無法讀取今日進度")
				} else {
					tray.SetLabel(progress.Label())
					tray.SetTooltip("Famo · 今日已完成 " + progress.Label())
				}
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
				}
			}
		}()
	})
}
