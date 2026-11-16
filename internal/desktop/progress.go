package desktop

import (
	"context"
	"fmt"
	"time"
)

// TodayProgress counts tasks by their scheduled local date, regardless of when
// they were completed. Deleted and unscheduled tasks are excluded by design.
type TodayProgress struct {
	Completed int
	Total     int
}

func (p TodayProgress) Label() string {
	return fmt.Sprintf("%d/%d", p.Completed, p.Total)
}

func (b *Backend) todayProgress(ctx context.Context, now time.Time) (TodayProgress, error) {
	items, err := b.store.List(ctx)
	if err != nil {
		return TodayProgress{}, err
	}
	var progress TodayProgress
	date := now.Format("2006-01-02")
	for _, task := range items {
		if task.DeletedAt != nil || task.ScheduledDate != date {
			continue
		}
		progress.Total++
		if task.CompletedAt != nil {
			progress.Completed++
		}
	}
	return progress, nil
}
