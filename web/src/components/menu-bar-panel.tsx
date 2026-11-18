import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Circle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ApiError, request, type Task } from '@/lib/api'
import { localDate } from '@/lib/calendar'
import { openFamo } from '@/lib/desktop'
import { useTheme } from '@/lib/theme'

function MenuBarTask({ task }: { task: Task }) {
  const client = useQueryClient()
  const toggle = useMutation({
    mutationFn: (snapshot: Task) =>
      request<Task>(`/tasks/${snapshot.id}/actions`, {
        op: snapshot.completed_at ? 'reopen_task' : 'complete_task',
        version: snapshot.version,
      }),
    onSuccess: async (updated) => {
      await client.cancelQueries({ queryKey: ['tasks'] })
      client.setQueryData<Task[]>(['tasks'], (items) =>
        items?.map((item) => (item.id === updated.id ? updated : item)),
      )
      void client.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  return (
    <li className={task.completed_at ? 'done' : ''}>
      <Checkbox
        className="menu-bar-task-checkbox"
        aria-label={`${task.completed_at ? '恢復' : '完成'}任務：${task.title}`}
        checked={!!task.completed_at}
        disabled={toggle.isPending}
        onCheckedChange={() => toggle.mutate(task)}
      />
      <div className="menu-bar-task-body">
        <span className="menu-bar-task-title">{task.title}</span>
        {toggle.isError && (
          <p className="menu-bar-task-error" role="alert">
            {toggle.error instanceof ApiError && toggle.error.status === 409
              ? '任務已變更，已重新讀取，請再試一次。'
              : `無法更新任務：${toggle.error.message}，請再試一次。`}
          </p>
        )}
      </div>
    </li>
  )
}

export function MenuBarPanel() {
  useTheme()
  const [date, setDate] = useState(localDate)
  const [openError, setOpenError] = useState('')
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: ({ signal }) => request<Task[]>('/tasks', undefined, signal),
    refetchInterval: 2_000,
    refetchOnWindowFocus: 'always',
  })
  useEffect(() => {
    const update = () => setDate(localDate())
    const timer = window.setInterval(update, 1_000)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
    }
  }, [])
  const today = (tasks.data ?? []).filter(
    (task) => task.scheduled_date === date && !task.deleted_at,
  )
  const completed = today.filter((task) => task.completed_at).length
  const percentage = today.length
    ? Math.round((completed / today.length) * 100)
    : 0
  const ordered = [...today].sort(
    (a, b) => Number(!!a.completed_at) - Number(!!b.completed_at),
  )

  return (
    <div className="menu-bar-panel">
      <header className="menu-bar-heading">
        <div className="menu-bar-brand">
          <img src="/famo-mark.svg" alt="" width="24" height="24" />
          <span>famo</span>
        </div>
        <div className="menu-bar-heading-actions">
          <time dateTime={date}>{date.replaceAll('-', '/')}</time>
          <Button
            size="sm"
            onClick={() => {
              setOpenError('')
              void openFamo().catch(() =>
                setOpenError('無法開啟 Famo，請重試。'),
              )
            }}
          >
            Open Famo <ArrowUpRight size={12} />
          </Button>
        </div>
      </header>
      {openError && (
        <p className="menu-bar-open-error" role="alert">
          {openError}
        </p>
      )}
      <section className="menu-bar-progress" aria-label="今日完成進度">
        <div>
          <h1>今日任務</h1>
          <span>
            {tasks.isPending || tasks.isError ? '—' : `${percentage}%`}
          </span>
        </div>
        <progress
          aria-label="今日完成比例"
          max={Math.max(today.length, 1)}
          value={tasks.isError ? 0 : completed}
        />
        <p role="status">
          {tasks.isPending
            ? '正在讀取今日任務…'
            : tasks.isError
              ? '今日進度暫時無法更新'
              : today.length
                ? `已完成 ${completed} / ${today.length} 件${completed === today.length ? '，今天的任務都完成了！' : ''}`
                : '今天還沒有安排任務'}
        </p>
      </section>
      <div className="menu-bar-tasks">
        {tasks.isError ? (
          <div className="menu-bar-empty" role="alert">
            <p>無法讀取任務，請重試。</p>
            <Button variant="outline" onClick={() => void tasks.refetch()}>
              <RefreshCw size={14} /> 重試
            </Button>
          </div>
        ) : !tasks.isPending && today.length === 0 ? (
          <div className="menu-bar-empty">
            <Circle size={28} aria-hidden="true" />
            <p>留一點時間，完成重要的小事。</p>
            <span>開啟 Famo，安排今天的第一件任務。</span>
          </div>
        ) : (
          <ul aria-label="今日任務列表">
            {ordered.map((task) => (
              <MenuBarTask key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
