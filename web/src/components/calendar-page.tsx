import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { type Task } from '@/lib/api'

type Props = {
  date: string
  tasks: Task[]
  search: string
  loading: boolean
  busy: boolean
  onReorder: (ids: string[]) => void
  onDragging: (dragging: boolean) => void
  onMove: (task: Task) => Promise<void>
  renderTask: (task: Task, index: number, disabled: boolean) => ReactNode
  drafts: ReactNode[]
}

export function CalendarPage({
  date,
  tasks,
  search,
  loading,
  busy,
  onReorder,
  onDragging,
  onMove,
  renderTask,
  drafts,
}: Props) {
  const client = useQueryClient()
  const [moving, setMoving] = useState(false)
  const disabled = busy || moving
  const [selected, setSelected] = useState<string[]>([])
  const matches = (task: Task) =>
    `${task.title} ${task.description}`
      .toLowerCase()
      .includes(search.toLowerCase())
  const daily = tasks.filter((task) => task.scheduled_date === date)
  const active = daily.filter((task) => !task.completed_at && matches(task))
  const completed = daily.filter((task) => task.completed_at && matches(task))
  const earlier = tasks
    .filter(
      (task) =>
        task.scheduled_date &&
        task.scheduled_date < date &&
        !task.completed_at &&
        matches(task),
    )
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
  const selectedEarlier = earlier.filter((task) => selected.includes(task.id))
  async function moveTasks(items: Task[]) {
    setMoving(true)
    try {
      for (const task of items) {
        try {
          await onMove(task)
          setSelected((ids) => ids.filter((id) => id !== task.id))
        } catch {
          // The shared mutation displays the error; keep failed tasks selected.
        }
      }
    } finally {
      setMoving(false)
    }
  }
  return (
    <section className="calendar-page" aria-label="日期任務">
      {!loading && (
        <>
          <p className="daily-progress">
            已完成 {daily.filter((task) => task.completed_at).length} /{' '}
            {daily.length}
          </p>
          <DragDropProvider
            onDragStart={() => {
              onDragging(true)
              void client.cancelQueries({ queryKey: ['tasks'] })
            }}
            onDragEnd={(event) => {
              onDragging(false)
              if (event.canceled || !isSortable(event.operation.source)) return
              const { initialIndex, index } = event.operation.source
              if (initialIndex === index) return
              const next = [...active]
              const [moved] = next.splice(initialIndex, 1)
              next.splice(index, 0, moved)
              onReorder(next.map((task) => task.id))
            }}
          >
            <ul className="task-list" aria-label="當日未完成任務">
              {active.map((task, index) => renderTask(task, index, disabled))}
              {drafts}
            </ul>
          </DragDropProvider>
          {!active.length && !completed.length && !drafts.length && (
            <div className="empty-list">
              {search ? '沒有符合的任務' : '這天尚無任務'}
            </div>
          )}
          {completed.length > 0 && (
            <section className="daily-completed" aria-label="當日已完成">
              <h2>已完成</h2>
              <DragDropProvider>
                <ul className="task-list" aria-label="當日已完成任務">
                  {completed.map((task, index) =>
                    renderTask(task, index, true),
                  )}
                </ul>
              </DragDropProvider>
            </section>
          )}
          <details className="earlier-tasks" key={date}>
            <summary>先前未完成（{earlier.length}）</summary>
            {earlier.length ? (
              <>
                <div className="earlier-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled || !selectedEarlier.length}
                    onClick={() => {
                      void moveTasks(selectedEarlier)
                    }}
                  >
                    將選取任務移到這天（{selectedEarlier.length}）
                  </Button>
                </div>
                <DragDropProvider>
                  <ul className="task-list" aria-label="先前未完成任務">
                    {earlier.map((task, index) => (
                      <li className="earlier-task" key={task.id}>
                        <div className="earlier-task-actions">
                          <Checkbox
                            aria-label={`選取任務：${task.title}`}
                            checked={selected.includes(task.id)}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              setSelected((ids) =>
                                checked
                                  ? [
                                      ...ids.filter((id) => id !== task.id),
                                      task.id,
                                    ]
                                  : ids.filter((id) => id !== task.id),
                              )
                            }
                          />
                          <time dateTime={task.scheduled_date}>
                            {task.scheduled_date}
                          </time>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={disabled}
                            onClick={() => void moveTasks([task])}
                          >
                            移到這天
                          </Button>
                        </div>
                        <ul>{renderTask(task, index, true)}</ul>
                      </li>
                    ))}
                  </ul>
                </DragDropProvider>
              </>
            ) : (
              <p className="empty-list">沒有先前未完成的任務</p>
            )}
          </details>
        </>
      )}
    </section>
  )
}
