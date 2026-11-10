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
	db := flag.String("db", path, "SQLite 檔案位置")
	addr := flag.String("addr", desktop.DefaultAPIAddr, "Agent API loopback 位址；空字串停用")
	flag.Parse()
	if err := desktop.Run(desktop.Config{DBPath: *db, APIAddr: *addr}); err != nil {
		log.Fatal(err)
	}
}
