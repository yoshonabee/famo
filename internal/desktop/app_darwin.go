//go:build darwin && !ios

package desktop

import (
	"log"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"famo/web"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

func Run(cfg Config) error {
	var backend *Backend
	language := &DisplayLanguage{}
	agentTools := &AgentTools{language: language}
	syncSettings := &SyncSettings{path: cfg.syncConfigPath(), dbPath: cfg.DBPath}
	menuBar := &MenuBar{refresh: make(chan struct{}, 1)}
	assets := application.BundledAssetFileServer(web.Assets())
	app := application.New(application.Options{
		Name: "Famo", Description: "每天一小步。",
		Logger: slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn})),
		Assets: application.AssetOptions{
			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasPrefix(r.URL.Path, "/wails/") {
					assets.ServeHTTP(w, r)
					return
				}
				backend.Handler().ServeHTTP(w, r)
			}),
			DisableLogging: true,
		},
		Mac: application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: false},
		Services: []application.Service{
			application.NewService(&ThemeFiles{language: language}),
			application.NewService(menuBar),
			application.NewService(agentTools),
			application.NewService(syncSettings),
			application.NewService(language),
			application.NewService(&LoginItem{}),
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "io.github.yoshonabee.famo",
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				if window, ok := application.Get().Window.GetByName("famo"); ok {
					window.Show()
					window.Focus()
				}
			},
		},
	})
	// Single-instance handling happens before opening the database or API port.
	var err error
	cfg.onSyncTasksChanged = func() { app.Event.Emit("famo:tasks-changed") }
	cfg.onSyncStatusChanged = func() { app.Event.Emit("famo:sync-status-changed") }
	backend, err = Start(cfg, web.Assets())
	if err != nil {
		app.Dialog.Error().SetTitle("無法開啟 Famo").SetMessage(err.Error()).Show()
		return err
	}
	agentTools.backend = backend
	syncSettings.store = backend.store
	syncSettings.backend = backend
	defer backend.Close()
	menu := app.NewMenu()
	appMenu := menu.AddSubmenu("Famo")
	appMenu.AddRole(application.About)
	appMenu.AddSeparator()
	language.addItem(appMenu, "偏好設定…", "Settings…").SetAccelerator("CmdOrCtrl+,").OnClick(func(*application.Context) {
		if window, ok := app.Window.GetByName("famo"); ok {
			window.Show()
			window.Focus()
			window.EmitEvent("famo:open-settings")
		}
	})
	appMenu.AddSeparator()
	appMenu.AddRole(application.ServicesMenu)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Hide)
	appMenu.AddRole(application.HideOthers)
	appMenu.AddRole(application.UnHide)
	appMenu.AddSeparator()
	appMenu.AddRole(application.Quit)
	addShortcut := func(menu *application.Menu, chinese, english, key, action string) {
		language.addItem(menu, chinese, english).SetAccelerator("CmdOrCtrl+" + key).OnClick(func(*application.Context) {
			if window, ok := app.Window.GetByName("famo"); ok {
				showFamo()
				window.EmitEvent("famo:shortcut", action)
			}
		})
	}
	fileMenu := language.addSubmenu(menu, "檔案", "File")
	addShortcut(fileMenu, "新增任務…", "New Task…", "t", "capture")
	fileMenu.AddSeparator()
	fileMenu.AddRole(application.CloseWindow)
	menu.AddRole(application.EditMenu)
	editMenu := menu.FindByRole(application.EditMenu).GetSubmenu()
	editMenu.AddSeparator()
	addShortcut(editMenu, "搜尋任務…", "Search Tasks…", "f", "search")
	addShortcut(editMenu, "搜尋所有任務…", "Search All Tasks…", "Shift+f", "global-search")
	viewMenu := language.addSubmenu(menu, "顯示", "View")
	addShortcut(viewMenu, "展開或收合側邊欄", "Toggle Sidebar", "d", "sidebar")
	addShortcut(viewMenu, "返回今日", "Go to Today", "k", "today")
	menu.AddRole(application.WindowMenu)
	app.Menu.Set(menu)
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "famo", Title: "Famo", URL: "/",
		Width: 1100, Height: 780, MinWidth: 620, MinHeight: 480,
		BackgroundColour: application.NewRGB(248, 247, 244),
		Mac:              application.MacWindow{TitleBar: application.MacTitleBarHidden},
		// Wails injects CSS as a JavaScript string literal on macOS.
		CSS: ":root { --window-titlebar-height: 30px; --window-controls-width: 78px; }",
	})
	if backend.stopSync != nil {
		app.Event.On("famo:sync-activity", func(*application.CustomEvent) { backend.syncActivity.Interacted() })
	}
	mainWindow.OnWindowEvent(events.Mac.WindowDidBecomeKey, func(*application.WindowEvent) {
		mainWindow.EmitEvent("famo:login-item-refresh")
		if backend.stopSync != nil {
			backend.syncActivity.RequestSync()
		}
	})
	mainWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		event.Cancel()
		mainWindow.Hide()
	})
	app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(*application.ApplicationEvent) {
		showFamo()
	})
	setupMenuBar(app, backend, menuBar, language)
	app.OnShutdown(func() {
		if err := backend.Close(); err != nil {
			log.Printf("關閉 Famo：%v", err)
		}
	})
	log.Printf("Famo 資料：%s", cfg.DBPath)
	if backend.APIURL() != "" {
		log.Printf("Famo Agent API：%s", backend.APIURL())
		if cfg.APIInfoPath != "" {
			log.Printf("Famo Agent API 位址檔案：%s", cfg.APIInfoPath)
		}
	}
	return app.Run()
}
