import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import {
  ArrowRight,
  CheckCheck,
  Clock3,
  ExternalLink,
  GripVertical,
  Inbox,
  Layers3,
  LoaderCircle,
  Plus,
  PanelRightOpen,
  Search,
  Sprout,
  Sun,
  TimerReset,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  SettingsPage,
  OptionSelect,
  optionStyle,
} from '@/components/settings-page'
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
  groupOf,
  orderSubset,
  request,
  type Action,
  type Group,
  type Task,
  type Settings,
} from '@/lib/api'

type Act = (t: Task, action: Action, done?: (updated: Task) => void) => void
const sections: {
  id: Group
  name: string
  caption: string
  icon: typeof Sun
}[] = [
  {
    id: 'ready',
    name: '可繼續',
    caption: '從一個小步驟開始，讓事情往前一點。',
    icon: Sun,
  },
  {
    id: 'review',
    name: '該回來看了',
    caption: '約定的時間到了，看看有沒有新的進展。',
    icon: TimerReset,
  },
  {
    id: 'waiting',
    name: '等外部結果',
    caption: '脈絡留在這裡，現在可以先做別的事。',
    icon: Clock3,
  },
]
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}
function Links({ task }: { task: Task }) {
  return (
    <div className="link-list">
      {task.links.map((l, i) => (
        <a
          key={`${l.url}-${i}`}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          title={l.url}
        >
          <ExternalLink size={12} />
          {l.type}
        </a>
      ))}
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
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => request<Settings>('/settings'),
    refetchInterval: 30_000,
  })
  const [view, setView] = useState<'active' | 'completed' | 'settings'>(
    'active',
  )
  const [search, setSearch] = useState('')
  const [create, setCreate] = useState(false)
  const capture = useQuickCapture(() => setSearch(''))
  const [captureFocus, setCaptureFocus] = useState(0)
  function startCapture() {
    setView('active')
    setCaptureFocus((count) => count + 1)
  }
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now())
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
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(interval)
  }, [])
  const mutation = useMutation({
    mutationFn: ({ t, action }: { t: Task; action: Action }) =>
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
    onError: (e) => {
      setMessage(e.message)
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const act: Act = (t, action, done) =>
    mutation.mutate({ t, action }, { onSuccess: done })
  const all = tasks.data ?? []
  const active = all.filter((t) => !t.completed_at)
  const filtered = all.filter(
    (t) =>
      (view === 'completed') === !!t.completed_at &&
      `${t.title} ${t.description} ${t.waiting_reason}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const detail = all.find((t) => t.id === selected)
  const today = new Date(now).toLocaleDateString('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  const tasksToday = all.filter(
    (t) =>
      t.completed_at &&
      new Date(t.completed_at).toDateString() === new Date(now).toDateString(),
  ).length
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Layers3 size={21} />
          </span>
          famo<span className="brand-dot">.</span>
        </a>
        <p className="workspace-label">PERSONAL WORKSPACE</p>
        <nav aria-label="主要導覽">
          <button
            className={view === 'active' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('active')}
          >
            <Inbox size={17} />
            我的工作台<span>{active.length}</span>
          </button>
          <button
            className={view === 'completed' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('completed')}
          >
            <CheckCheck size={17} />
            已完成<span>{all.length - active.length}</span>
          </button>
          <button
            className={view === 'settings' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('settings')}
          >
            下拉選項設定
          </button>
        </nav>
        <div className="sidebar-note">
          <Sprout size={22} />
          <p>
            一次一小步，
            <br />
            把重要的事慢慢完成。
          </p>
        </div>
        <div className="local-status">
          <span />
          資料保存在這台電腦
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            我的空間 <span className="slash">/</span>{' '}
            {view === 'settings'
              ? '下拉選項設定'
              : view === 'active'
                ? '工作台'
                : '已完成'}
          </span>
          <span className="date">{today}</span>
        </header>
        <div className="main-content">
          {view === 'settings' ? (
            settings.data ? (
              <SettingsPage settings={settings.data} />
            ) : (
              <p role="status">{settings.error?.message ?? '讀取設定中…'}</p>
            )
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR EVERYDAY, A LITTLE CLEARER</div>
                  <h1>
                    {view === 'active'
                      ? '留住脈絡，接著往前。'
                      : '每一步，都算數。'}
                  </h1>
                  <p>
                    {view === 'active'
                      ? '不用重新回想。下一步，已經在這裡。'
                      : '回顧已經完成的事，也看看自己走了多遠。'}
                  </p>
                </div>
                <Button onClick={startCapture}>
                  <Plus />
                  新增任務
                </Button>
              </div>
              {view === 'active' && (
                <div className="overview">
                  <div>
                    <span className="overview-dot ready" />
                    現在可推進
                    <strong>
                      {active.filter((t) => groupOf(t, now) === 'ready').length}
                    </strong>
                  </div>
                  <div>
                    <span className="overview-dot review" />
                    需要回來看
                    <strong>
                      {
                        active.filter((t) => groupOf(t, now) === 'review')
                          .length
                      }
                    </strong>
                  </div>
                  <div>
                    <CheckCheck size={16} />
                    今天完成的任務<strong>{tasksToday}</strong>
                  </div>
                  <span className="overview-note">進展，從小事開始</span>
                </div>
              )}
              <div className="list-toolbar">
                <span>
                  {view === 'active' ? '我的任務' : '完成紀錄'}{' '}
                  <small>{filtered.length}</small>
                </span>
                <div className="toolbar-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreate(true)}
                  >
                    完整表單
                  </Button>
                  <div className="search">
                    <Search size={15} />
                    <input
                      aria-label="搜尋任務"
                      placeholder="搜尋任務與脈絡…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <QuickCapture
                hidden={view !== 'active'}
                focusRequest={captureFocus}
                onSubmit={capture.submit}
                announcement={capture.announcement}
              />
              {tasks.isPending && (
                <div className="state">
                  <LoaderCircle className="animate-spin" />
                  正在讀取工作台…
                </div>
              )}
              {tasks.isError && (
                <div role="alert" className="state">
                  無法讀取任務：{tasks.error.message}
                  <Button
                    variant="outline"
                    onClick={() => void tasks.refetch()}
                  >
                    重新讀取
                  </Button>
                </div>
              )}
              {tasks.isSuccess &&
                view === 'active' &&
                sections.map((section) => {
                  const list = filtered.filter(
                    (t) => groupOf(t, now) === section.id,
                  )
                  const drafts = section.id === 'ready' ? capture.drafts : []
                  return (
                    <section
                      className={`task-section section-${section.id}`}
                      key={section.id}
                    >
                      <div className="section-heading">
                        <section.icon size={17} />
                        <h2>{section.name}</h2>
                        <span className="count">
                          {list.length + drafts.length}
                        </span>
                        <p>{section.caption}</p>
                      </div>
                      {list.length || drafts.length ? (
                        <DragDropProvider
                          onDragStart={() => {
                            setDragging(true)
                            void client.cancelQueries({ queryKey: ['tasks'] })
                          }}
                          onDragEnd={(event) => {
                            setDragging(false)
                            if (
                              event.canceled ||
                              !isSortable(event.operation.source)
                            )
                              return
                            const { initialIndex, index } =
                              event.operation.source
                            if (initialIndex === index) return
                            const next = [...list]
                            const [moved] = next.splice(initialIndex, 1)
                            next.splice(index, 0, moved)
                            reorder.mutate(next.map((t) => t.id))
                          }}
                        >
                          <ul className="task-list">
                            {list.map((t, index) => (
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
                                act={act}
                                onOpen={() => setSelected(t.id)}
                                onComplete={() =>
                                  act(t, { op: 'complete_task' })
                                }
                                settings={settings.data}
                              />
                            ))}
                            {drafts.map((draft) => (
                              <CaptureDraftRow
                                key={draft.id}
                                draft={draft}
                                retry={capture.retry}
                              />
                            ))}
                          </ul>
                        </DragDropProvider>
                      ) : (
                        <div className="empty-section">
                          {section.id === 'ready' ? (
                            search ? (
                              '沒有符合的任務。'
                            ) : (
                              <>
                                <span>留一件想推進的事，從下一步開始。</span>
                                <button onClick={startCapture}>
                                  新增第一件任務 <Plus size={13} />
                                </button>
                              </>
                            )
                          ) : section.id === 'review' ? (
                            '目前沒有到期的查看提醒。'
                          ) : (
                            '目前沒有等待中的任務。'
                          )}
                        </div>
                      )}
                    </section>
                  )
                })}
              {tasks.isSuccess &&
                view === 'completed' &&
                (filtered.length ? (
                  <DragDropProvider>
                    <ul className="task-list">
                      {filtered.map((t, index) => (
                        <TaskRow
                          key={t.id}
                          index={index}
                          task={t}
                          busy={mutation.isPending}
                          act={act}
                          onOpen={() => setSelected(t.id)}
                          onComplete={() => act(t, { op: 'reopen_task' })}
                          settings={settings.data}
                        />
                      ))}
                    </ul>
                  </DragDropProvider>
                ) : (
                  <div className="state">
                    <CheckCheck />
                    {search
                      ? '沒有符合的任務。'
                      : '完成的任務會留在這裡。先從一個小步驟開始吧。'}
                  </div>
                ))}
            </>
          )}
          <footer>
            讓腦袋留給思考，讓 famo 記得進度。
            <span>LOCAL FIRST · YOUR OWN PACE</span>
          </footer>
        </div>
      </main>
      <CreateDialog
        open={create}
        onOpenChange={setCreate}
        settings={settings.data}
        onError={setMessage}
      />
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
            settings={settings.data}
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
  act,
  onOpen,
  onComplete,
  index,
  settings,
  sortableDisabled = false,
}: {
  task: Task
  busy: boolean
  act: Act
  onOpen: () => void
  onComplete: () => void
  index: number
  settings?: Settings
  sortableDisabled?: boolean
}) {
  const completed = !!t.completed_at
  const title = t.title
  const { ref, handleRef, isDragging } = useSortable({
    id: t.id,
    index,
    disabled: completed || sortableDisabled,
  })
  const workflow = settings?.workflows.find((w) => w.id === t.type)
  const stage = workflow?.stages.find((s) => s.id === t.stage)
  const priority = settings?.priorities.find((p) => p.id === String(t.priority))
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
        <Checkbox
          checked={completed}
          disabled={busy}
          aria-label={`${completed ? '恢復' : '完成'}任務：${title}`}
          onCheckedChange={onComplete}
        />
        <TodoTitle task={t} title={title} onDeleted={() => {}} />
        <div className="row-chips">
          {priority && (
            <span className="task-chip" style={optionStyle(priority)}>
              {priority.name}
            </span>
          )}
          {!completed && workflow ? (
            <OptionSelect
              className="task-chip row-stage-select"
              label={`變更狀態：${title}`}
              options={workflow.stages}
              value={t.stage}
              disabled={busy}
              onChange={(stage) => {
                if (stage !== t.stage) act(t, { op: 'update', stage })
              }}
            />
          ) : (
            <span
              className="task-chip"
              style={completed ? undefined : optionStyle(stage)}
            >
              {completed
                ? `已完成 · ${dateTime(t.completed_at)}`
                : (stage?.name ?? t.stage)}
            </span>
          )}
          {!completed && t.waiting_reason && (
            <span className="task-chip waiting-chip">
              <Clock3 size={11} />
              等待 {t.waiting_reason}
            </span>
          )}
          {!completed && t.review_at && (
            <span className="task-chip review-chip">
              <TimerReset size={11} />
              {dateTime(t.review_at)} 回來看
            </span>
          )}
          <Links task={t} />
        </div>
        <button
          className="row-detail-button"
          onClick={onOpen}
          aria-label={`任務詳情：${title}`}
          title="編輯任務詳情"
        >
          <PanelRightOpen size={15} />
        </button>
      </div>
    </li>
  )
}
function WaitingForm({
  task,
  act,
  busy,
  onDone,
}: {
  task: Task
  act: Act
  busy: boolean
  onDone: () => void
}) {
  const [version, setVersion] = useState(task.version)
  const [waiting, setWaiting] = useState(task.waiting_reason)
  const [review, setReview] = useState(() => {
    if (!task.review_at) return ''
    const date = new Date(task.review_at)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
  })
  const baseline = useRef({ waiting, review })
  function reload(updated: Task) {
    setVersion(updated.version)
    setWaiting(updated.waiting_reason)
    const date = updated.review_at ? new Date(updated.review_at) : null
    const nextReview = date
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
      : ''
    setReview(nextReview)
    baseline.current = { waiting: updated.waiting_reason, review: nextReview }
  }
  useEffect(() => {
    if (
      waiting === baseline.current.waiting &&
      review === baseline.current.review
    )
      reload(task)
  }, [task.version])

  const changed = version !== task.version
  function submit(e: FormEvent) {
    e.preventDefault()
    if (changed) return
    act(
      { ...task, version },
      {
        op: 'update',
        waiting_reason: waiting.trim(),
        review_at: review ? new Date(review).toISOString() : '',
      },
      (updated) => {
        reload(updated)
        onDone()
      },
    )
  }
  return (
    <form className="next-form" onSubmit={submit}>
      <h3>等待與提醒</h3>
      {changed && (
        <div className="conflict-notice" role="status">
          任務已有新進度。請先重新載入，確認後再編輯。
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => reload(task)}
          >
            重新載入設定
          </Button>
        </div>
      )}
      <div className="form-grid">
        <Field label="等待原因（選填）">
          <input
            placeholder="例如：CI 執行中"
            value={waiting}
            onChange={(e) => setWaiting(e.target.value)}
          />
        </Field>
        <Field label="下次查看（選填）">
          <input
            type="datetime-local"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
        </Field>
      </div>
      <div className="form-actions">
        <Button size="sm" disabled={busy || changed}>
          {busy ? '儲存中…' : '儲存等待與提醒'}
          <ArrowRight />
        </Button>
      </div>
    </form>
  )
}
function CreateDialog({
  open,
  onOpenChange,
  settings,
  onError,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  settings?: Settings
  onError: (v: string) => void
}) {
  const client = useQueryClient()
  const [chosenType, setType] = useState('')
  useEffect(() => {
    if (open) setType('')
  }, [open])
  const workflows = settings?.workflows ?? []
  const type = chosenType || settings?.default_type || ''
  const create = useMutation({
    mutationFn: (body: unknown) => request<Task>('/tasks', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['tasks'] })
      onOpenChange(false)
    },
    onError: (e) => onError(e.message),
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    create.mutate({
      title: f.get('title'),
      description: f.get('description'),
      type,
      priority: Number(f.get('priority')),
      source: 'ui',
    })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!create.isPending) onOpenChange(v)
      }}
    >
      <DialogContent>
        <DialogTitle className="dialog-title">留下一件想推進的事</DialogTitle>
        <DialogDescription className="dialog-description">
          先記下任務，其餘的可以邊做邊補。
        </DialogDescription>
        <form onSubmit={submit} className="stack-form">
          <Field label="任務名稱">
            <input
              name="title"
              autoFocus
              required
              placeholder="例如：修好登入逾時的問題"
              maxLength={200}
            />
          </Field>
          <div className="form-grid">
            <Field label="任務類型">
              <OptionSelect
                label="任務類型"
                options={workflows}
                value={type}
                onChange={setType}
              />
            </Field>
            <Field label="優先順序">
              <OptionSelect
                label="優先順序"
                name="priority"
                options={settings?.priorities ?? []}
                defaultValue={String(settings?.default_priority ?? 1)}
              />
            </Field>
          </div>
          <Field label="描述">
            <textarea
              name="description"
              placeholder="留下任務內容、背景或完成條件…"
              rows={5}
            />
          </Field>
          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button disabled={create.isPending || !workflows.length}>
              {create.isPending ? '建立中…' : '建立任務'}
              <Plus />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
function Detail({
  task: t,
  settings,
  act,
  busy,
}: {
  task: Task
  settings?: Settings
  act: Act
  busy: boolean
}) {
  const workflows = settings?.workflows ?? []
  const [adding, setAdding] = useState(false)
  const completed = !!t.completed_at
  function addLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    act(
      t,
      {
        op: 'add_link',
        links: [{ type: String(f.get('type')), url: String(f.get('url')) }],
      },
      () => {
        form.reset()
        setAdding(false)
      },
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
        <span className="eyebrow">TASK CONTEXT · V{t.version}</span>
        <DialogTitle className="dialog-title" aria-label={t.title}>
          <InlineContent task={t} field="title" busy={busy} />
        </DialogTitle>
        <DialogDescription className="dialog-description">
          保留整件事的脈絡，隨時接著做。
        </DialogDescription>
      </div>
      <div className="detail-meta">
        <label>
          任務類型{' '}
          <OptionSelect
            label="任務類型"
            options={workflows}
            value={t.type}
            disabled={busy || completed}
            onChange={(type) => {
              const w = workflows.find((w) => w.id === type)!
              act(t, { op: 'update', type, stage: w.default_stage })
            }}
          />
        </label>
        <label>
          流程階段{' '}
          <OptionSelect
            label="流程階段"
            options={workflows.find((w) => w.id === t.type)?.stages ?? []}
            value={t.stage}
            disabled={busy || completed}
            onChange={(stage) => act(t, { op: 'update', stage })}
          />
        </label>
        <label>
          優先順序{' '}
          <OptionSelect
            label="優先順序"
            options={settings?.priorities ?? []}
            value={String(t.priority)}
            disabled={busy || completed}
            onChange={(priority) =>
              act(t, { op: 'update', priority: Number(priority) })
            }
          />
        </label>
        {completed && <span>已完成 · {dateTime(t.completed_at)}</span>}
      </div>
      <div className="detail-block">
        <h3>描述</h3>
        <InlineContent task={t} field="description" busy={busy} />
      </div>
      {!completed && (
        <div className="detail-block">
          <WaitingForm
            key={t.id}
            task={t}
            act={act}
            busy={busy}
            onDone={() => {}}
          />
        </div>
      )}
      {!completed && t.waiting_reason && (
        <div className="detail-wait">
          <Clock3 size={18} />
          <div>
            等待 {t.waiting_reason}
            <small>
              自 {dateTime(t.waiting_since)}
              {t.review_at && ` · ${dateTime(t.review_at)} 回來看`}
            </small>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => act(t, { op: 'resume' })}
          >
            回到可繼續
          </Button>
        </div>
      )}
      <div className="detail-block">
        <div className="block-heading">
          <h3>相關連結</h3>
          {!completed && (
            <Button
              variant="ghost"
              size="sm"
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
                <span>{l.type}</span>
                <span>{l.url}</span>
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        ) : (
          <p className="muted">把 PR、Asana 和 Slack 討論串留在一起。</p>
        )}
        {adding && (
          <form className="link-form" onSubmit={addLink}>
            <Field label="類型">
              <input name="type" placeholder="GitHub PR" required />
            </Field>
            <Field label="URL">
              <input
                name="url"
                type="url"
                pattern="https?://.*"
                placeholder="https://…"
                required
              />
            </Field>
            <Button disabled={busy} size="sm">
              加入
            </Button>
          </form>
        )}
      </div>
      {Object.keys(t.metadata).length > 0 && (
        <div className="detail-block">
          <h3>類型資訊</h3>
          <pre>{JSON.stringify(t.metadata, null, 2)}</pre>
        </div>
      )}
      <details className="detail-block">
        <summary>進展歷程（{t.history.length}）</summary>
        <ol className="history">
          {[...t.history].reverse().map((e) => (
            <li key={e.version}>
              <span className="history-dot" />
              <div>
                {e.summary}
                <small>
                  {e.source} · {dateTime(e.at)} · v{e.version}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </details>
      {!completed && (
        <div className="finish-task">
          <div>
            <h3>整件事都完成了？</h3>
            <p>確認任務已完成，就把它記入完成紀錄。</p>
          </div>
          <Button
            disabled={busy}
            onClick={() => act(t, { op: 'complete_task' })}
          >
            <CheckCheck />
            完成整件任務
          </Button>
        </div>
      )}
      {completed && (
        <div className="finish-task">
          <p>需要接著做？可以將任務恢復為未完成。</p>
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
