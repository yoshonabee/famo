package main

import (
	"context"
	"famo/internal/server"
	"famo/internal/tasks"
	"famo/web"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8787", "本機監聽位址")
	data := flag.String("db", "data/famo.db", "SQLite 檔案位置")
	flag.Parse()
	if err := os.MkdirAll(filepath.Dir(*data), 0700); err != nil {
		log.Fatal(err)
	}
	store, err := tasks.Open(*data)
	if err != nil {
		log.Fatal(err)
	}
	defer store.Close()
	srv := &http.Server{Addr: *addr, Handler: server.New(store, web.Assets()), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdown); err != nil {
			log.Print(err)
		}
	}()
	log.Printf("Famo → http://%s（資料：%s）", *addr, *data)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
