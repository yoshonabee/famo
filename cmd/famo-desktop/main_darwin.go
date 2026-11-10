//go:build darwin && !ios

package main

import (
	"flag"
	"log"

	"famo/internal/desktop"
)

func main() {
	path, err := desktop.DefaultDatabasePath()
	if err != nil {
		log.Fatal(err)
	}
	infoPath, err := desktop.DefaultAPIInfoPath()
	if err != nil {
		log.Fatal(err)
	}
	db := flag.String("db", path, "SQLite 檔案位置")
	addr := flag.String("addr", desktop.DefaultAPIAddr, "Agent API loopback 位址；port 0 自動分配，空字串停用")
	apiInfo := flag.String("api-info", infoPath, "Agent API 位址檔案位置")
	flag.Parse()
	if err := desktop.Run(desktop.Config{DBPath: *db, APIAddr: *addr, APIInfoPath: *apiInfo}); err != nil {
		log.Fatal(err)
	}
}
