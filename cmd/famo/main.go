package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"famo/internal/server"
	"famo/internal/syncclient"
	"famo/internal/tasks"
	"famo/web"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if len(os.Args) > 1 && os.Args[1] == "sync" {
		if err := syncclient.Command(ctx, os.Args[2:], os.Stdout, "data/famo.db"); err != nil && !errors.Is(err, flag.ErrHelp) {
			log.Fatal(err)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "cleanup" {
		if err := runCleanup(ctx, os.Args[2:], os.Stdout); err != nil && !errors.Is(err, flag.ErrHelp) {
			log.Fatal(err)
		}
		return
	}
	addr := flag.String("addr", "127.0.0.1:8787", "本機監聽位址")
	data := flag.String("db", "data/famo.db", "SQLite 檔案位置")
	syncPath := flag.String("sync-config", "", "Sync configuration file")
	flag.Parse()
	if err := os.MkdirAll(filepath.Dir(*data), 0700); err != nil {
		log.Fatal(err)
	}
	store, err := tasks.Open(*data)
	if err != nil {
		log.Fatal(err)
	}
	defer store.Close()
	if *syncPath != "" {
		cfg, err := syncclient.ReadConfig(*syncPath)
		if err != nil {
			log.Fatal(err)
		}
		runner, err := syncclient.New(ctx, store, cfg, nil)
		if err != nil {
			log.Fatal(err)
		}
		syncCtx, cancel := context.WithCancel(ctx)
		done := make(chan struct{})
		go func() {
			defer close(done)
			runner.Run(syncCtx, func(err error) { log.Printf("Sync: %v", err) })
		}()
		defer func() {
			cancel()
			<-done
		}()
	}
	srv := &http.Server{Addr: *addr, Handler: server.New(store, web.Assets()), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
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
