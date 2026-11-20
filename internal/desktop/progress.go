package desktop

import (
	"context"
	"fmt"
	"slices"
	"time"

	"famo/internal/tasks"
)

// TodayProgress counts tasks by their scheduled local date, regardless of when
// they were completed. Deleted and unscheduled tasks are excluded by design.
type TodayProgress struct {
	Completed int
	Total     int
	BoardName string
}

func (p TodayProgress) Label() string {
	return fmt.Sprintf("%d/%d", p.Completed, p.Total)
}

func (b *Backend) todayProgress(ctx context.Context, now time.Time, boardID string) (TodayProgress, error) {
	var board *tasks.Board
	if boardID != "" {
		boards, err := b.store.ListBoards(ctx)
		if err != nil {
			return TodayProgress{}, err
		}
		for i := range boards {
			if boards[i].ID == boardID {
				board = &boards[i]
				break
			}
		}
	}
	items, err := b.store.List(ctx)
	if err != nil {
		return TodayProgress{}, err
	}
	var progress TodayProgress
	if board != nil {
		progress.BoardName = board.Name
	}
	date := now.Format("2006-01-02")
	for _, task := range items {
		if task.DeletedAt != nil || task.ScheduledDate != date {
			continue
		}
		if board != nil && !slices.Contains(board.ProjectIDs, task.ProjectID) {
			continue
		}
		progress.Total++
		if task.CompletedAt != nil {
			progress.Completed++
		}
	}
	return progress, nil
}
