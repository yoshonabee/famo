//go:build darwin && !ios

package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"os"

	"famo/internal/desktop"
	"famo/internal/syncclient"
)

func main() {
	path, err := desktop.DefaultDatabasePath()
	if err != nil {
		log.Fatal(err)
	}
	if len(os.Args) > 1 && os.Args[1] == "sync" {
		if err := syncclient.Command(context.Background(), os.Args[2:], os.Stdout, path); err != nil && !errors.Is(err, flag.ErrHelp) {
			log.Fatal(err)
		}
		return
	}
	infoPath, err := desktop.DefaultAPIInfoPath()
	if err != nil {
		log.Fatal(err)
	}
	db := flag.String("db", path, "SQLite 檔案位置")
	addr := flag.String("addr", desktop.DefaultAPIAddr, "Agent API loopback 位址；port 0 自動分配，空字串停用")
	apiInfo := flag.String("api-info", infoPath, "Agent API 位址檔案位置")
	syncPath := flag.String("sync-config", "", "Sync configuration file (defaults to famo-sync.json beside the database)")
	flag.Parse()
	usePreference := true
	flag.Visit(func(option *flag.Flag) {
		if option.Name == "addr" {
			usePreference = false
		}
	})
	if err := desktop.Run(desktop.Config{DBPath: *db, APIAddr: *addr, APIInfoPath: *apiInfo, UseAPIPreference: usePreference, SyncConfigPath: *syncPath, UseDefaultSyncConfig: true}); err != nil {
		log.Fatal(err)
	}
}
