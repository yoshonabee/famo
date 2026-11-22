import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import { TaskMoveSection } from '@/components/task-move-section'
import { localDate } from '@/lib/calendar'
import { compareCompletionTime, type Task } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

type Props = {
  date: string
  tasks: Task[]
  projectFiltered: boolean
  search: string
  loading: boolean
  busy: boolean
  onReorder: (ids: string[]) => void
  onDragging: (dragging: boolean) => void
  onMove: (task: Task, date: string) => Promise<void>
  renderTask: (
    task: Task,
    index: number,
    disabled: boolean,
    hideCompletion?: boolean,
  ) => ReactNode
  drafts: ReactNode[]
}

export function CalendarPage({
  date,
  tasks,
  projectFiltered,
  search,
  loading,
  busy,
  onReorder,
  onDragging,
  onMove,
  renderTask,
  drafts,
}: Props) {
  const { t } = useLanguage()
  const client = useQueryClient()
  const [moving, setMoving] = useState(false)
  const disabled = busy || moving
  const matches = (task: Task) =>
    `${task.title} ${task.description}`
      .toLowerCase()
      .includes(search.toLowerCase())
  const daily = tasks.filter((task) => task.scheduled_date === date)
  const active = daily.filter((task) => !task.completed_at && matches(task))
  const completed = daily
    .filter((task) => task.completed_at && matches(task))
    .sort(compareCompletionTime)
  const earlier = tasks
    .filter(
      (task) =>
        task.scheduled_date &&
        task.scheduled_date < date &&
        !task.completed_at &&
        matches(task),
    )
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
  const moveSection = {
    busy: disabled,
    onMoving: setMoving,
    onMove: (task: Task) => onMove(task, date),
    renderTask: (task: Task, index: number) =>
      renderTask(task, index, true, true),
  }
  return (
    <section className="calendar-page" aria-label={t('datedTasks')}>
      {!loading && (
        <>
          <p className="daily-progress">
            {t(
              'dailyProgress',
              daily.filter((task) => task.completed_at).length,
              daily.length,
            )}
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
            <ul className="task-list" aria-label={t('dailyOpenTasks')}>
              {active.map((task, index) => renderTask(task, index, disabled))}
              {drafts}
            </ul>
          </DragDropProvider>
          {!active.length && !completed.length && !drafts.length && (
            <div className="empty-list">
              {search || projectFiltered ? t('noMatches') : t('noTasksForDate')}
            </div>
          )}
          {completed.length > 0 && (
            <section
              className="daily-completed"
              aria-label={t('dailyCompleted')}
            >
              <h2>{t('completed')}</h2>
              <DragDropProvider>
                <ul className="task-list" aria-label={t('dailyCompletedTasks')}>
                  {completed.map((task, index) =>
                    renderTask(task, index, true),
                  )}
                </ul>
              </DragDropProvider>
            </section>
          )}
          <TaskMoveSection kind="earlier" tasks={earlier} {...moveSection} />
          {date === localDate() && (
            <TaskMoveSection
              kind="undated"
              tasks={tasks.filter(
                (task) =>
                  !task.scheduled_date && !task.completed_at && matches(task),
              )}
              {...moveSection}
            />
          )}
        </>
      )}
    </section>
  )
}
