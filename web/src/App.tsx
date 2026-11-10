import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import {
  CalendarDays,
  CheckCheck,
  ExternalLink,
  GripVertical,
  Inbox,
  LoaderCircle,
  Plus,
  PanelRightOpen,
  Search,
} from 'lucide-react'
import { DateNavigation } from '@/components/date-navigation'
import { CalendarPage } from '@/components/calendar-page'
import { localDate } from '@/lib/calendar'
import { linkLabel } from '@/lib/links'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TaskDate } from '@/components/task-date'
import { InlineContent } from '@/components/inline-content'
import { TodoTitle } from '@/components/todo-title'
import {
  CaptureDraftRow,
  QuickCapture,
  useQuickCapture,
} from '@/components/quick-capture'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ApiError,
  dateTime,
  orderSubset,
  request,
  type Action,
  type Task,
} from '@/lib/api'

type Act = (
  t: Task,
  action: Action,
  done?: (updated: Task) => void,
  failed?: (message: string) => void,
) => void
function Links({ task, onOpen }: { task: Task; onOpen: () => void }) {
  if (!task.links.length) return null
  return (
    <div className="link-list">
      {task.links.slice(0, 2).map((link, index) => (
        <a
          key={`${link.url}-${index}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          title={link.url}
        >
          <ExternalLink size={12} />
          <span>{linkLabel(link.url)}</span>
        </a>
      ))}
      {task.links.length > 2 && (
        <button
          className="more-links"
          onClick={onOpen}
          aria-label={`查看其餘 ${task.links.length - 2} 個連結：${task.title}`}
        >
          +{task.links.length - 2}
        </button>
      )}
    </div>
  )
}
function App() {
  const client = useQueryClient()
  const [dragging, setDragging] = useState(false)
  const [ordering, setOrdering] = useState(false)
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: ({ signal }) => request<Task[]>('/tasks', undefined, signal),
    enabled: !dragging && !ordering,
    refetchInterval: 30_000,
  })
  const [view, setView] = useState<'active' | 'date' | 'completed'>('date')
  const [date, setDate] = useState(localDate)
  const [search, setSearch] = useState('')
  const capture = useQuickCapture(
    () => setSearch(''),
    view === 'date' ? date : '',
  )
  const visibleDrafts = capture.drafts.filter((draft) =>
    view === 'date' ? draft.scheduled_date === date : true,
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      request<Task[]>('/tasks/reorder', { task_ids: ids }),
    onMutate: async (ids) => {
      setOrdering(true)
      await client.cancelQueries({ queryKey: ['tasks'] })
      const previous = client.getQueryData<Task[]>(['tasks']) ?? []
      client.setQueryData(['tasks'], orderSubset(previous, ids))
      return previous.map((t) => t.id)
    },
    onSuccess: (updated) => client.setQueryData(['tasks'], updated),
    onError: (error, _ids, previous) => {
      client.setQueryData<Task[]>(['tasks'], (current) =>
        orderSubset(current ?? [], previous ?? []),
      )
      setMessage(`順序未儲存：${error.message}`)
    },
    onSettled: () => {
      setOrdering(false)
      void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const mutation = useMutation({
    mutationFn: ({
      t,
      action,
    }: {
      t: Task
      action: Action
      failed?: (message: string) => void
    }) =>
      request<Task>(`/tasks/${t.id}/actions`, {
        ...action,
        version: t.version,
        source: 'ui',
      }),
    onSuccess: (t) => {
      client.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((item) => (item.id === t.id ? t : item)),
      )
      void client.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e, { failed }) => {
      if (failed) failed(e.message)
      else setMessage(e.message)
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const act: Act = (t, action, done, failed) =>
    mutation.mutate({ t, action, failed }, { onSuccess: done })
  const all = tasks.data ?? []
  const active = all.filter((t) => !t.completed_at)
  const filtered = all.filter(
    (t) =>
      (view === 'completed') === !!t.completed_at &&
      `${t.title} ${t.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const detail = all.find((t) => t.id === selected)
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <img
            className="brand-mark"
            src="/famo-mark.svg"
            alt=""
            width={28}
            height={28}
          />
          famo
        </a>
        <nav aria-label="主要導覽">
          <button
            className={view === 'date' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setDate(localDate())
              setView('date')
            }}
            aria-label="今日任務"
          >
            <CalendarDays size={17} />
            今日
          </button>
          <button
            className={view === 'active' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('active')}
            aria-label="任務列表"
          >
            <Inbox size={17} />
            任務<span>{active.length}</span>
          </button>
          <button
            className={view === 'completed' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('completed')}
          >
            <CheckCheck size={17} />
            已完成<span>{all.length - active.length}</span>
          </button>
        </nav>
      </aside>
      <main>
        <div className="main-content">
          {view === 'date' && (
            <header className="calendar-heading">
              <h1>
                <time dateTime={date}>
                  {new Date(`${date}T12:00:00`).toLocaleDateString('zh-TW', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                <span className="date-weekday">
                  {new Date(`${date}T12:00:00`).toLocaleDateString('zh-TW', {
                    weekday: 'long',
                  })}
                </span>
              </h1>
              <DateNavigation date={date} onChange={setDate} />
            </header>
          )}
          <div className="list-toolbar">
            {view !== 'date' && (
              <div className="list-title">
                <h1>{view === 'active' ? '任務' : '已完成'}</h1>
                <span className="list-count">{filtered.length}</span>
              </div>
            )}
            <div className="search">
              <Search size={16} />
              <input
                aria-label="搜尋任務"
                placeholder="搜尋"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <QuickCapture
            hidden={view !== 'active' && view !== 'date'}
            onSubmit={capture.submit}
            announcement={capture.announcement}
          />
          {view === 'date' && (
            <CalendarPage
              date={date}
              key={date}
              tasks={all}
              search={search}
              loading={!tasks.isSuccess}
              busy={mutation.isPending || reorder.isPending}
              onReorder={(ids) => reorder.mutate(ids)}
              onDragging={setDragging}
              onMove={async (task, targetDate) => {
                await mutation.mutateAsync({
                  t: task,
                  action: { op: 'update', scheduled_date: targetDate },
                })
              }}
              renderTask={(task, index, disabled, hideCompletion) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={index}
                  hideCompletion={hideCompletion}
                  sortableDisabled={disabled || visibleDrafts.length > 0}
                  busy={mutation.isPending}
                  onOpen={() => setSelected(task.id)}
                  onComplete={() =>
                    act(task, {
                      op: task.completed_at ? 'reopen_task' : 'complete_task',
                    })
                  }
                />
              )}
              drafts={visibleDrafts.map((draft) => (
                <CaptureDraftRow
                  key={draft.id}
                  draft={draft}
                  retry={capture.retry}
                />
              ))}
            />
          )}
          {tasks.isPending && (
            <div className="state">
              <LoaderCircle className="animate-spin" />
              讀取中…
            </div>
          )}
          {tasks.isError && (
            <div role="alert" className="state">
              無法讀取任務：{tasks.error.message}
              <Button variant="outline" onClick={() => void tasks.refetch()}>
                重新讀取
              </Button>
            </div>
          )}
          {tasks.isSuccess && view === 'active' && (
            <>
              <DragDropProvider
                onDragStart={() => {
                  setDragging(true)
                  void client.cancelQueries({ queryKey: ['tasks'] })
                }}
                onDragEnd={(event) => {
                  setDragging(false)
                  if (event.canceled || !isSortable(event.operation.source))
                    return
                  const { initialIndex, index } = event.operation.source
                  if (initialIndex === index) return
                  const next = [...filtered]
                  const [moved] = next.splice(initialIndex, 1)
                  next.splice(index, 0, moved)
                  reorder.mutate(next.map((t) => t.id))
                }}
              >
                <ul className="task-list" aria-label="主要任務列表">
                  {filtered.map((t, index) => (
                    <TaskRow
                      key={t.id}
                      index={index}
                      sortableDisabled={
                        reorder.isPending ||
                        mutation.isPending ||
                        capture.drafts.length > 0
                      }
                      task={t}
                      busy={mutation.isPending}
                      onOpen={() => setSelected(t.id)}
                      onComplete={() => act(t, { op: 'complete_task' })}
                    />
                  ))}
                  {capture.drafts.map((draft) => (
                    <CaptureDraftRow
                      key={draft.id}
                      draft={draft}
                      retry={capture.retry}
                    />
                  ))}
                </ul>
              </DragDropProvider>
              {!filtered.length && !capture.drafts.length && (
                <div className="empty-list">
                  {search ? '沒有符合的任務' : '尚無任務'}
                </div>
              )}
            </>
          )}
          {tasks.isSuccess &&
            view === 'completed' &&
            (filtered.length ? (
              <DragDropProvider>
                <ul className="task-list" aria-label="已完成任務列表">
                  {filtered.map((t, index) => (
                    <TaskRow
                      key={t.id}
                      index={index}
                      task={t}
                      busy={mutation.isPending}
                      onOpen={() => setSelected(t.id)}
                      onComplete={() => act(t, { op: 'reopen_task' })}
                    />
                  ))}
                </ul>
              </DragDropProvider>
            ) : (
              <div className="state">
                <CheckCheck />
                {search ? '沒有符合的任務。' : '尚無已完成任務'}
              </div>
            ))}
        </div>
      </main>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        {detail && (
          <Detail
            key={detail.id}
            task={detail}
            act={act}
            busy={mutation.isPending}
          />
        )}
      </Dialog>
      {message && (
        <div className="toast" role="alert">
          <span>{message}</span>
          <button aria-label="關閉提示" onClick={() => setMessage('')}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
function TaskRow({
  task: t,
  busy,
  onOpen,
  onComplete,
  index,
  sortableDisabled = false,
  hideCompletion = false,
}: {
  task: Task
  busy: boolean
  onOpen: () => void
  onComplete: () => void
  index: number
  sortableDisabled?: boolean
  hideCompletion?: boolean
}) {
  const completed = !!t.completed_at
  const title = t.title
  const { ref, handleRef, isDragging } = useSortable({
    id: t.id,
    index,
    disabled: completed || sortableDisabled,
  })
  return (
    <li
      ref={ref}
      data-task-id={t.id}
      className={`task-row ${completed ? 'is-completed' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <div className="todo-line">
        <button
          ref={handleRef}
          className="drag-handle"
          disabled={completed || sortableDisabled}
          aria-label={`拖曳排序：${title}`}
          title="拖曳調整順序"
        >
          <GripVertical size={16} />
        </button>
        {!hideCompletion && (
          <Checkbox
            checked={completed}
            disabled={busy}
            aria-label={`${completed ? '恢復' : '完成'}任務：${title}`}
            onCheckedChange={onComplete}
          />
        )}
        <TodoTitle task={t} title={title} onDeleted={() => {}} />
        <Links task={t} onOpen={onOpen} />
        <button
          className="row-detail-button"
          onClick={onOpen}
          aria-label={`任務詳情：${title}`}
          title="備註與連結"
        >
          <PanelRightOpen size={15} />
        </button>
      </div>
    </li>
  )
}
function Detail({
  task: t,
  act,
  busy,
}: {
  task: Task
  act: Act
  busy: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [linkError, setLinkError] = useState('')
  const completed = !!t.completed_at
  function addLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    setLinkError('')
    act(
      t,
      {
        op: 'add_link',
        links: [{ url: String(f.get('url')).trim() }],
      },
      () => {
        form.reset()
        setAdding(false)
      },
      setLinkError,
    )
  }
  return (
    <DialogContent
      className="max-w-3xl"
      onEscapeKeyDown={(event) => {
        if ((event.target as Element)?.closest('.inline-content-editor'))
          event.preventDefault()
      }}
    >
      <div className="detail-heading">
        <DialogTitle className="dialog-title" aria-label={t.title}>
          <InlineContent task={t} field="title" busy={busy} />
        </DialogTitle>
        <DialogDescription className="sr-only">
          日期、備註與相關連結
        </DialogDescription>
      </div>
      <div className="detail-meta">
        <TaskDate task={t} busy={busy} />
        {completed && <span>已完成 · {dateTime(t.completed_at)}</span>}
      </div>
      <div className="detail-block">
        <h3>備註</h3>
        <InlineContent task={t} field="description" busy={busy} />
      </div>
      <div className="detail-block">
        <div className="block-heading">
          <h3>相關連結</h3>
          {!completed && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-expanded={adding}
              onClick={() => setAdding(!adding)}
            >
              <Plus />
              新增連結
            </Button>
          )}
        </div>
        {t.links.length ? (
          <div className="detail-links">
            {t.links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noreferrer">
                <span>{linkLabel(l.url)}</span>
                <span>{l.url}</span>
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        ) : (
          <p className="muted">尚無連結</p>
        )}
        {adding && (
          <form onSubmit={addLink}>
            <div className="link-form">
              <label className="field">
                <span>連結網址</span>
                <input
                  name="url"
                  aria-label="連結網址"
                  type="url"
                  pattern="https?://.*"
                  placeholder="貼上 https://…"
                  required
                  autoFocus
                  readOnly={busy}
                />
              </label>
              <Button disabled={busy} size="sm">
                加入
              </Button>
            </div>
            {linkError && (
              <p className="inline-edit-error" role="alert">
                {linkError}。網址已保留，請確認最新內容後重試。
              </p>
            )}
          </form>
        )}
      </div>
      {!completed && (
        <div className="finish-task">
          <Button
            disabled={busy}
            onClick={() => act(t, { op: 'complete_task' })}
          >
            <CheckCheck />
            完成任務
          </Button>
        </div>
      )}
      {completed && (
        <div className="finish-task">
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => act(t, { op: 'reopen_task' })}
          >
            恢復為未完成
          </Button>
        </div>
      )}
    </DialogContent>
  )
}
export default App
