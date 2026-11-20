import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, RotateCcw, Trash2 } from 'lucide-react'
import { TaskSearch } from '@/components/task-palette'
import { Button } from '@/components/ui/button'
import { ApiError, dateTime, request, type Task } from '@/lib/api'

const queryKey = ['tasks', 'recently-deleted']

export function RecentlyDeletedPage({
  search,
  onSearchChange,
}: {
  search: string
  onSearchChange: (search: string) => void
}) {
  const client = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)
  const [restoredTitle, setRestoredTitle] = useState('')
  const tasks = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      request<Task[]>('/tasks/recently-deleted', undefined, signal),
    staleTime: 0,
    refetchInterval: 30_000,
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
      if (document.activeElement === document.body) heading.current?.focus()
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
      <header className="list-toolbar">
        <div className="list-title">
          <h1 ref={heading} tabIndex={-1}>
            最近刪除
          </h1>
          {tasks.isSuccess && (
            <span className="list-count">{filtered.length}</span>
          )}
        </div>
        <TaskSearch value={search} onChange={onSearchChange} />
      </header>
      <p className="muted recently-deleted-hint">
        刪除後保留 7 天，可在期限內還原。
      </p>
      <div className="sr-only" role="status">
        {restoredTitle && `已還原「${restoredTitle}」`}
      </div>
      {restore.isError && (
        <p className="inline-edit-error" role="alert">
          無法還原任務：{restore.error.message}
        </p>
      )}
      {tasks.isPending && (
        <div className="state">
          <LoaderCircle className="animate-spin" />
          讀取中…
        </div>
      )}
      {tasks.isError && (
        <div className="state" role="alert">
          無法讀取最近刪除：{tasks.error.message}
          <Button variant="outline" onClick={() => void tasks.refetch()}>
            重新讀取
          </Button>
        </div>
      )}
      {tasks.isSuccess &&
        (filtered.length ? (
          <ul className="task-list" aria-label="最近刪除的任務">
            {filtered.map((task) => (
              <li className="task-row recently-deleted-row" key={task.id}>
                <div className="todo-line">
                  <div className="recently-deleted-task">
                    <span>{task.title}</span>
                    <div className="recently-deleted-meta">
                      已刪除{' '}
                      <time dateTime={task.deleted_at ?? undefined}>
                        {dateTime(task.deleted_at)}
                      </time>
                      {task.scheduled_date &&
                        ` · 任務日期 ${task.scheduled_date}`}
                      {task.completed_at && ' · 已完成'}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={restore.isPending}
                    aria-label={`還原任務：${task.title}`}
                    onClick={() => restore.mutate(task)}
                  >
                    <RotateCcw aria-hidden="true" />
                    還原
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="state">
            <Trash2 aria-hidden="true" />
            {search ? '沒有符合的任務' : '最近沒有刪除的任務'}
          </div>
        ))}
    </>
  )
}
