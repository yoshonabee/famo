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
)

func Run(cfg Config) error {
	var backend *Backend
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
		Mac: application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
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
	defer backend.Close()
	app.OnShutdown(func() {
		if err := backend.Close(); err != nil {
			log.Printf("關閉 Famo：%v", err)
		}
	})
	menu := app.NewMenu()
	menu.AddRole(application.AppMenu)
	menu.AddRole(application.EditMenu)
	menu.AddRole(application.WindowMenu)
	app.Menu.Set(menu)
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "famo", Title: "Famo", URL: "/",
		Width: 1100, Height: 780, MinWidth: 620, MinHeight: 480,
		BackgroundColour: application.NewRGB(248, 247, 244),
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
