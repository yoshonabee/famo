package syncclient

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"os"

	"famo/internal/tasks"
)

func Command(ctx context.Context, args []string, out io.Writer, defaultDB string) error {
	if len(args) == 0 || (args[0] != "status" && args[0] != "resolve" && args[0] != "resolve-collections") {
		return errors.New("usage: famo sync status|resolve|resolve-collections [options]")
	}
	flags := flag.NewFlagSet("sync "+args[0], flag.ContinueOnError)
	db := flags.String("db", defaultDB, "SQLite database path")
	var choice *string
	var localVersion, remoteVersion *int
	var localToken *string
	var collectionVersion *int64
	switch args[0] {
	case "resolve":
		choice = flags.String("choice", "", "local or remote")
		localVersion = flags.Int("local-version", -1, "local version shown by sync status")
		remoteVersion = flags.Int("remote-version", -1, "remote version shown by sync status (0 when remote is null)")
	case "resolve-collections":
		choice = flags.String("choice", "", "local or remote")
		localToken = flags.String("local-token", "", "local token shown by sync status")
		collectionVersion = flags.Int64("remote-version", -1, "remote collection version shown by sync status")
	}
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	if choice == nil && flags.NArg() != 0 {
		return errors.New("usage: famo sync status [-db path]")
	}
	if localToken != nil && (flags.NArg() != 0 || (*choice != "local" && *choice != "remote") ||
		*localToken == "" || *collectionVersion < 0) {
		return errors.New("usage: famo sync resolve-collections [-db path] -choice local|remote -local-token TOKEN -remote-version N")
	}
	if localVersion != nil && (flags.NArg() != 1 || (*choice != "local" && *choice != "remote") || *localVersion < 1 || *remoteVersion < 0) {
		return errors.New("usage: famo sync resolve [-db path] -choice local|remote -local-version N -remote-version N TASK_ID")
	}
	if _, err := os.Stat(*db); err != nil {
		return err
	}
	store, err := tasks.Open(*db)
	if err != nil {
		return err
	}
	defer store.Close()
	if localToken != nil {
		return store.ResolveCollectionConflict(ctx, *localToken, *collectionVersion, *choice == "local")
	}
	if localVersion != nil {
		return store.ResolveSyncConflict(ctx, flags.Arg(0), *localVersion, *remoteVersion, *choice == "local")
	}
	status, err := store.SyncStatus(ctx)
	if err != nil {
		return err
	}
	return json.NewEncoder(out).Encode(status)
}
