package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"

	"famo/internal/tasks"
)

func runCleanup(ctx context.Context, args []string, out io.Writer) error {
	flags := flag.NewFlagSet("famo cleanup", flag.ContinueOnError)
	db := flags.String("db", "", "要檢查的 SQLite 資料庫路徑")
	apply := flags.Bool("apply", false, "確認清理舊資料")
	backup := flags.String("backup", "", "清理前要建立的備份路徑")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 || *db == "" {
		return errors.New("用法：famo cleanup -db PATH [-apply -backup PATH]")
	}
	if !*apply && *backup != "" {
		return errors.New("請與 -apply 搭配指定 -backup")
	}
	var report tasks.CleanupReport
	var err error
	if *apply {
		report, err = tasks.ApplyCleanup(ctx, *db, *backup)
	} else {
		report, err = tasks.PreviewCleanup(ctx, *db)
	}
	if err != nil && report.Backup == "" {
		return err
	}
	if outputErr := json.NewEncoder(out).Encode(report); outputErr != nil {
		return errors.Join(err, fmt.Errorf("輸出清理結果：%w", outputErr))
	}
	return err
}
