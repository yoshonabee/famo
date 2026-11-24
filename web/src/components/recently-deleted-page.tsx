import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, RotateCcw, Trash2 } from 'lucide-react'
import { TaskSearch } from '@/components/task-palette'
import { Button } from '@/components/ui/button'
import { ApiError, dateTime, request, type Task } from '@/lib/api'
import { useSyncRefetchInterval } from '@/lib/cloud-events'
import { useLanguage } from '@/lib/i18n'
import { formatListDate } from '@/lib/calendar'

const queryKey = ['tasks', 'recently-deleted']

export function RecentlyDeletedPage({
  compact = false,
  search,
  onSearchChange,
}: {
  compact?: boolean
  search: string
  onSearchChange: (search: string) => void
}) {
  const { t, locale, errorText } = useLanguage()
  const client = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)
  const hint = useRef<HTMLParagraphElement>(null)
  const [restoredTitle, setRestoredTitle] = useState('')
  const tasks = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      request<Task[]>('/tasks/recently-deleted', undefined, signal),
    staleTime: 0,
    refetchInterval: useSyncRefetchInterval(),
  })
  const restore = useMutation({
    mutationFn: (task: Task) =>
      request<Task>(`/tasks/${task.id}/restore`, { version: task.version }),
    onMutate: () => setRestoredTitle(''),
    onSuccess: (task) => {
      client.setQueryData<Task[]>(queryKey, (old) =>
        old?.filter((item) => item.id !== task.id),
      )
      void client.invalidateQueries({ queryKey: ['tasks'] })
      setRestoredTitle(task.title)
      if (document.activeElement === document.body)
        (compact ? hint.current : heading.current)?.focus()
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 409)
      )
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const filtered = (tasks.data ?? []).filter((task) =>
    `${task.title} ${task.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  return (
    <>
      {!compact && (
        <header className="list-toolbar">
          <div className="list-title">
            <h1 ref={heading} tabIndex={-1}>
              {t('recentlyDeleted')}
            </h1>
            {tasks.isSuccess && (
              <span className="list-count">{filtered.length}</span>
            )}
          </div>
          <TaskSearch value={search} onChange={onSearchChange} />
        </header>
      )}
      <p
        className="muted recently-deleted-hint"
        ref={hint}
        tabIndex={compact ? -1 : undefined}
      >
        {t('recentlyDeletedDescription')}
      </p>
      <div className="sr-only" role="status">
        {restoredTitle && t('taskRestored', restoredTitle)}
      </div>
      {restore.isError && (
        <p className="inline-edit-error" role="alert">
          {t('restoreError', errorText(restore.error))}
        </p>
      )}
      {tasks.isPending && (
        <div className="state">
          <LoaderCircle className="animate-spin" />
          {t('loading')}
        </div>
      )}
      {tasks.isError && (
        <div className="state" role="alert">
          {t('loadRecentlyDeletedError', errorText(tasks.error))}
          <Button variant="outline" onClick={() => void tasks.refetch()}>
            {t('reload')}
          </Button>
        </div>
      )}
      {tasks.isSuccess &&
        (filtered.length ? (
          <ul className="task-list" aria-label={t('deletedTaskList')}>
            {filtered.map((task) => (
              <li className="task-row recently-deleted-row" key={task.id}>
                <div className="todo-line">
                  <div className="recently-deleted-task">
                    <span>{task.title}</span>
                    <div className="recently-deleted-meta">
                      {t('deletedAt')}{' '}
                      <time dateTime={task.deleted_at ?? undefined}>
                        {dateTime(task.deleted_at, locale)}
                      </time>
                      {task.scheduled_date &&
                        t(
                          'deletedTaskDate',
                          formatListDate(task.scheduled_date, locale),
                        )}
                      {task.completed_at && t('deletedTaskCompleted')}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={restore.isPending}
                    aria-label={t('restoreNamedTask', task.title)}
                    onClick={() => restore.mutate(task)}
                  >
                    <RotateCcw aria-hidden="true" />
                    {t('restore')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="state">
            <Trash2 aria-hidden="true" />
            {search ? t('noMatches') : t('noDeletedTasks')}
          </div>
        ))}
    </>
  )
}
