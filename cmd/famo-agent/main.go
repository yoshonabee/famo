package main

import (
	"context"
	"os"
	"os/signal"

	"famo/internal/agentcli"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if code := agentcli.Run(ctx, os.Args[1:], os.Stdout, os.Stderr); code != 0 {
		os.Exit(code)
	}
}
