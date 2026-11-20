import { useState, type ReactNode } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { type Task } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'
import { formatTaskDate } from '@/lib/calendar'

export function TaskMoveSection({
  kind,
  tasks,
  busy,
  onMoving,
  onMove,
  renderTask,
}: {
  kind: 'earlier' | 'undated'
  tasks: Task[]
  busy: boolean
  onMoving: (moving: boolean) => void
  onMove: (task: Task) => Promise<void>
  renderTask: (task: Task, index: number) => ReactNode
}) {
  const { t, locale } = useLanguage()
  const [selected, setSelected] = useState<string[]>([])
  const chosen = tasks.filter((task) => selected.includes(task.id))
  const earlier = kind === 'earlier'
  const visibleIds = new Set(tasks.map((task) => task.id))
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const group = groups.get(task.scheduled_date) ?? []
    group.push(task)
    groups.set(task.scheduled_date, group)
  }

  async function moveTasks(items: Task[]) {
    onMoving(true)
    try {
      for (const task of items) {
        try {
          await onMove(task)
          setSelected((ids) => ids.filter((id) => id !== task.id))
        } catch {
          // The shared mutation shows errors and failed tasks stay selected.
        }
      }
    } finally {
      onMoving(false)
    }
  }

  function renderRows(items: Task[]) {
    return items.map((task, index) => (
      <li className="task-move-row" key={task.id}>
        <Checkbox
          aria-label={t('selectTask', task.title)}
          checked={selected.includes(task.id)}
          disabled={busy}
          onCheckedChange={(checked) =>
            setSelected((ids) =>
              checked
                ? [...new Set([...ids, task.id])]
                : ids.filter((id) => id !== task.id),
            )
          }
        />
        <ul>{renderTask(task, index)}</ul>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void moveTasks([task])}
        >
          {t('moveToDate')}
        </Button>
      </li>
    ))
  }

  return (
    <details className={`task-move-section ${kind}-tasks`}>
      <summary>
        {t(earlier ? 'earlierTasksCount' : 'undatedTasksCount', tasks.length)}
      </summary>
      {tasks.length ? (
        <>
          <div className="task-move-actions">
            <label>
              <Checkbox
                aria-label={t(
                  earlier ? 'selectAllEarlier' : 'selectAllUndated',
                )}
                disabled={busy}
                checked={
                  chosen.length === tasks.length
                    ? true
                    : chosen.length
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(checked) =>
                  setSelected((ids) =>
                    checked
                      ? [...new Set([...ids, ...visibleIds])]
                      : ids.filter((id) => !visibleIds.has(id)),
                  )
                }
              />
              {t('selectAll')}
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !chosen.length}
              onClick={() => void moveTasks(chosen)}
            >
              {t('moveSelectedTasks', chosen.length)}
            </Button>
          </div>
          <DragDropProvider>
            <ul
              className="task-list"
              aria-label={t(earlier ? 'earlierTaskList' : 'undatedTaskList')}
            >
              {Array.from(groups, ([scheduledDate, items]) =>
                scheduledDate ? (
                  <li className="task-move-date-group" key={scheduledDate}>
                    <h3>
                      <time dateTime={scheduledDate}>
                        {formatTaskDate(scheduledDate, locale)}
                      </time>
                    </h3>
                    <ul
                      className="task-list"
                      aria-label={t(
                        'incompleteTasksForDate',
                        formatTaskDate(scheduledDate, locale),
                      )}
                    >
                      {renderRows(items)}
                    </ul>
                  </li>
                ) : (
                  renderRows(items)
                ),
              )}
            </ul>
          </DragDropProvider>
        </>
      ) : (
        <p className="empty-list">
          {t(earlier ? 'noEarlierTasks' : 'noUndatedTasks')}
        </p>
      )}
    </details>
  )
}
