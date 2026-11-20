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
	agentTools := &AgentTools{}
	driveBackup := &DriveBackup{dbPath: cfg.DBPath, client: googleDriveClient()}
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
			application.NewService(&ThemeFiles{}),
			application.NewService(&MenuBar{}),
			application.NewService(agentTools),
			application.NewService(driveBackup),
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
	backend, err = Start(cfg, web.Assets())
	if err != nil {
		app.Dialog.Error().SetTitle("無法開啟 Famo").SetMessage(err.Error()).Show()
		return err
	}
	agentTools.backend = backend
	defer backend.Close()
	menu := app.NewMenu()
	appMenu := menu.AddSubmenu("Famo")
	appMenu.AddRole(application.About)
	appMenu.AddSeparator()
	appMenu.Add("偏好設定…").SetAccelerator("CmdOrCtrl+,").OnClick(func(*application.Context) {
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
	addShortcut := func(menu *application.Menu, title, key, action string) {
		menu.Add(title).SetAccelerator("CmdOrCtrl+" + key).OnClick(func(*application.Context) {
			if window, ok := app.Window.GetByName("famo"); ok {
				(&MenuBar{}).OpenFamo()
				window.EmitEvent("famo:shortcut", action)
			}
		})
	}
	fileMenu := menu.AddSubmenu("File")
	addShortcut(fileMenu, "新增任務…", "t", "capture")
	fileMenu.AddSeparator()
	fileMenu.AddRole(application.CloseWindow)
	menu.AddRole(application.EditMenu)
	editMenu := menu.FindByRole(application.EditMenu).GetSubmenu()
	editMenu.AddSeparator()
	addShortcut(editMenu, "搜尋任務…", "f", "search")
	viewMenu := menu.AddSubmenu("View")
	addShortcut(viewMenu, "展開或收合側邊欄", "d", "sidebar")
	addShortcut(viewMenu, "返回今日", "k", "today")
	menu.AddRole(application.WindowMenu)
	app.Menu.Set(menu)
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "famo", Title: "Famo", URL: "/",
		Width: 1100, Height: 780, MinWidth: 620, MinHeight: 480,
		BackgroundColour: application.NewRGB(248, 247, 244),
	})
	mainWindow.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		event.Cancel()
		mainWindow.Hide()
	})
	app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(*application.ApplicationEvent) {
		(&MenuBar{}).OpenFamo()
	})
	setupMenuBar(app, backend)
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
