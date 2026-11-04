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
  currentStep,
  dateTime,
  groupOf,
  orderSubset,
  request,
  type Action,
  type Group,
  type Task,
  type Workflow,
} from '@/lib/api'

type Act = (t: Task, action: Action, done?: (updated: Task) => void) => void
type Feedback = { group: Group; label: string; stepId: string }
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
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: () => request<Workflow[]>('/workflows'),
  })
  const [view, setView] = useState<'active' | 'completed'>('active')
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
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
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
      setFeedback((old) => {
        const entry = old[t.id]
        if (
          !entry ||
          (!t.completed_at &&
            t.steps.find((s) => s.id === entry.stepId)?.completed_at)
        )
          return old
        const next = { ...old }
        delete next[t.id]
        return next
      })
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
  const release = (id: string) =>
    setFeedback((old) => {
      const next = { ...old }
      delete next[id]
      return next
    })
  const all = tasks.data ?? []
  const active = all.filter((t) => !t.completed_at)
  const filtered = all.filter(
    (t) =>
      (view === 'completed') === !!t.completed_at &&
      `${t.title} ${t.goal} ${t.context} ${t.waiting_reason} ${t.steps.map((s) => s.title).join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const detail = all.find((t) => t.id === selected)
  const today = new Date(now).toLocaleDateString('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  const stepsToday = all
    .flatMap((t) => t.steps)
    .filter(
      (s) =>
        s.completed_at &&
        new Date(s.completed_at).toDateString() ===
          new Date(now).toDateString(),
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
            {view === 'active' ? '工作台' : '已完成'}
          </span>
          <span className="date">{today}</span>
        </header>
        <div className="main-content">
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
                  {active.filter((t) => groupOf(t, now) === 'review').length}
                </strong>
              </div>
              <div>
                <CheckCheck size={16} />
                今天完成的小步驟<strong>{stepsToday}</strong>
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
              <Button variant="outline" onClick={() => void tasks.refetch()}>
                重新讀取
              </Button>
            </div>
          )}
          {tasks.isSuccess &&
            view === 'active' &&
            sections.map((section) => {
              const list = filtered.filter(
                (t) =>
                  (feedback[t.id]?.group ?? groupOf(t, now)) === section.id,
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
                    <span className="count">{list.length + drafts.length}</span>
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
                        const { initialIndex, index } = event.operation.source
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
                            feedback={feedback[t.id]}
                            busy={mutation.isPending}
                            act={act}
                            onOpen={() => setSelected(t.id)}
                            onComplete={() => {
                              const step = currentStep(t)
                              if (!step) {
                                act(t, { op: 'complete_task' })
                              } else
                                act(
                                  t,
                                  { op: 'complete_step', step_id: step.id },
                                  () =>
                                    setFeedback((old) => ({
                                      ...old,
                                      [t.id]: {
                                        group: groupOf(t, now),
                                        label: step.title,
                                        stepId: step.id,
                                      },
                                    })),
                                )
                            }}
                            onContinue={() => release(t.id)}
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
                      onContinue={() => {}}
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
          <footer>
            讓腦袋留給思考，讓 famo 記得進度。
            <span>LOCAL FIRST · YOUR OWN PACE</span>
          </footer>
        </div>
      </main>
      <CreateDialog
        open={create}
        onOpenChange={setCreate}
        workflows={workflows.data ?? []}
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
            workflows={workflows.data ?? []}
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
  feedback,
  busy,
  act,
  onOpen,
  onComplete,
  onContinue,
  index,
  sortableDisabled = false,
}: {
  task: Task
  feedback?: Feedback
  busy: boolean
  act: Act
  onOpen: () => void
  onComplete: () => void
  onContinue: () => void
  index: number
  sortableDisabled?: boolean
}) {
  const step = currentStep(t)
  const done = t.steps.filter((s) => s.completed_at).length
  const completed = !!t.completed_at
  const child = !completed && (!!step || !!feedback)
  const title = completed
    ? t.title
    : (t.steps.find((s) => s.id === feedback?.stepId)?.title ??
      feedback?.label ??
      step?.title ??
      t.title)
  const stepId = child ? (feedback?.stepId ?? step?.id) : undefined
  const line = useRef<HTMLDivElement>(null)
  const disabled = completed || !!feedback || sortableDisabled
  const { ref, handleRef, isDragging } = useSortable({
    id: t.id,
    index,
    disabled,
  })
  return (
    <li
      ref={ref}
      data-task-id={t.id}
      className={`task-row ${feedback ? 'has-feedback' : ''} ${completed ? 'is-completed' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <div
        ref={line}
        className="todo-line"
        onClick={(e) => {
          if (
            !(e.target as Element).closest('button,input,a,[role="checkbox"]')
          )
            line.current
              ?.querySelector<HTMLInputElement>('input.todo-title')
              ?.focus()
        }}
      >
        <button
          ref={handleRef}
          className="drag-handle"
          disabled={disabled}
          aria-label={`拖曳排序：${title}`}
          title="拖曳調整順序；或按空白鍵後用上下鍵移動"
        >
          <GripVertical size={16} />
        </button>
        <Checkbox
          checked={completed || !!feedback}
          disabled={busy}
          aria-label={
            completed
              ? `恢復任務：${t.title}`
              : feedback
                ? `恢復步驟：${title}`
                : child
                  ? `完成步驟：${title}`
                  : `完成任務：${t.title}`
          }
          onCheckedChange={() =>
            feedback
              ? act(
                  t,
                  { op: 'reopen_step', step_id: feedback.stepId },
                  onContinue,
                )
              : onComplete()
          }
        />
        <TodoTitle
          task={t}
          title={title}
          stepId={stepId}
          onDeleted={onContinue}
        />
        <div className="row-chips">
          {child && (
            <button
              className="task-chip parent-chip"
              onClick={onOpen}
              title={`所屬任務：${t.title}`}
              aria-label={`所屬任務：${t.title}`}
            >
              <Layers3 size={11} />
              {t.title}
            </button>
          )}
          {t.priority === 2 && <span className="task-chip priority">優先</span>}
          <span className="task-chip">
            {completed ? `已完成 · ${dateTime(t.completed_at)}` : t.stage}
          </span>
          {t.steps.length > 0 && (
            <span
              className="task-chip progress-chip"
              title={`已完成 ${done} / ${t.steps.length} 個步驟`}
            >
              {done}/{t.steps.length}
            </span>
          )}
          {!completed && t.waiting_reason && (
            <span
              className="task-chip waiting-chip"
              title={`自 ${dateTime(t.waiting_since)} 開始等待`}
            >
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
          {feedback && <span className="task-chip saved-chip">已儲存</span>}
          <Links task={t} />
        </div>
        <button
          className="row-detail-button"
          onClick={onOpen}
          aria-label={`任務詳情：${t.title}`}
          title="編輯任務詳情"
        >
          <PanelRightOpen size={15} />
        </button>
      </div>
      {feedback && (
        <div className="row-followup">
          <NextStepForm task={t} act={act} busy={busy} onDone={onContinue} />
        </div>
      )}
    </li>
  )
}
function NextStepForm({
  task,
  act,
  busy,
  onDone,
  stepCompleted = true,
}: {
  task: Task
  act: Act
  busy: boolean
  onDone: () => void
  stepCompleted?: boolean
}) {
  const [version, setVersion] = useState(task.version)
  const [next, setNext] = useState(currentStep(task)?.title ?? '')
  const [waiting, setWaiting] = useState(task.waiting_reason)
  const [review, setReview] = useState(() => {
    if (!task.review_at) return ''
    const date = new Date(task.review_at)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
  })
  function reload(updated: Task) {
    setVersion(updated.version)
    setNext(currentStep(updated)?.title ?? '')
    setWaiting(updated.waiting_reason)
    const date = updated.review_at ? new Date(updated.review_at) : null
    setReview(
      date
        ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 16)
        : '',
    )
  }
  const changed = version !== task.version
  function submit(e: FormEvent) {
    e.preventDefault()
    if (changed) return
    act(
      { ...task, version },
      {
        op: waiting.trim()
          ? 'set_waiting'
          : next.trim()
            ? 'update_next_step'
            : 'update',
        next_step: next.trim() || undefined,
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
      <p>{stepCompleted && <span>這一步完成了。</span>}接下來，想怎麼推進？</p>
      {changed && (
        <div className="conflict-notice" role="status">
          任務已有新進度。請先重新載入，確認後再編輯。
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => reload(task)}
          >
            重新載入下一步
          </Button>
        </div>
      )}
      <Field label="下一步">
        <input
          placeholder="一個具體、做得到的小步驟"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
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
        <small>
          {stepCompleted
            ? '任務會停在原位，直到你確認。'
            : '階段、等待與查看時間可以分別設定。'}
        </small>
        <Button size="sm" disabled={busy || changed}>
          {busy ? '儲存中…' : '確認並繼續'}
          <ArrowRight />
        </Button>
      </div>
    </form>
  )
}
function CreateDialog({
  open,
  onOpenChange,
  workflows,
  onError,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workflows: Workflow[]
  onError: (v: string) => void
}) {
  const client = useQueryClient()
  const [type, setType] = useState('development')
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
      goal: f.get('goal'),
      context: f.get('context'),
      acceptance: f.get('acceptance'),
      type,
      priority: Number(f.get('priority')),
      steps: String(f.get('steps'))
        .split('\n')
        .filter((s) => s.trim()),
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
          先寫眼前的下一步。其餘的，可以邊做邊補。
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
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="優先順序">
              <select name="priority" defaultValue="1">
                <option value="2">優先處理</option>
                <option value="1">一般</option>
                <option value="0">之後再做</option>
              </select>
            </Field>
          </div>
          <Field label="目標">
            <textarea
              name="goal"
              placeholder="完成這件事後，希望達成什麼？"
              rows={2}
            />
          </Field>
          <Field label="下一步與子步驟（每行一個）">
            <textarea
              name="steps"
              placeholder="先重現問題，再補一個測試…"
              rows={3}
            />
          </Field>
          <details>
            <summary>補上背景與驗收條件</summary>
            <div className="stack-form mt-3">
              <Field label="背景脈絡">
                <textarea name="context" rows={3} />
              </Field>
              <Field label="驗收條件">
                <textarea name="acceptance" rows={2} />
              </Field>
            </div>
          </details>
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
  workflows,
  act,
  busy,
}: {
  task: Task
  workflows: Workflow[]
  act: Act
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editVersion, setEditVersion] = useState(t.version)
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState('')
  const completed = !!t.completed_at
  function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    act(
      { ...t, version: editVersion },
      {
        op: 'update',
        title: String(f.get('title')),
        goal: String(f.get('goal')),
        context: String(f.get('context')),
        acceptance: String(f.get('acceptance')),
        priority: Number(f.get('priority')),
      },
      () => setEditing(false),
    )
  }
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
    <DialogContent className="max-w-3xl">
      <div className="detail-heading">
        <span className="eyebrow">TASK CONTEXT · V{t.version}</span>
        <DialogTitle className="dialog-title">{t.title}</DialogTitle>
        <DialogDescription className="dialog-description">
          保留整件事的脈絡，從下一步接著做。
        </DialogDescription>
      </div>
      <div className="detail-meta">
        <span>{workflows.find((w) => w.id === t.type)?.name}</span>
        {completed ? (
          <span className="text-primary">
            已完成 · {dateTime(t.completed_at)}
          </span>
        ) : (
          <label className="inline-flex items-center gap-2">
            流程階段
            <select
              aria-label="流程階段"
              disabled={busy}
              value={t.stage}
              onChange={(e) => act(t, { op: 'update', stage: e.target.value })}
            >
              {workflows
                .find((w) => w.id === t.type)
                ?.stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </select>
          </label>
        )}
        <span>{['之後再做', '一般', '優先處理'][t.priority]}</span>
        {!completed && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditVersion(t.version)
              setEditing(!editing)
            }}
          >
            {editing ? '取消編輯' : '編輯內容'}
          </Button>
        )}
      </div>
      {editing ? (
        <form
          key={editVersion}
          className="stack-form detail-block"
          onSubmit={update}
        >
          {editVersion !== t.version && (
            <div className="conflict-notice" role="status">
              任務已有新進度。你的輸入仍保留在此，重新載入會改用最新內容。
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditVersion(t.version)}
              >
                重新載入內容
              </Button>
            </div>
          )}
          <Field label="任務名稱">
            <input name="title" required defaultValue={t.title} />
          </Field>
          <Field label="目標">
            <textarea name="goal" defaultValue={t.goal} />
          </Field>
          <Field label="背景脈絡">
            <textarea name="context" defaultValue={t.context} rows={4} />
          </Field>
          <Field label="驗收條件">
            <textarea name="acceptance" defaultValue={t.acceptance} />
          </Field>
          <Field label="優先順序">
            <select name="priority" defaultValue={t.priority}>
              <option value="2">優先處理</option>
              <option value="1">一般</option>
              <option value="0">之後再做</option>
            </select>
          </Field>
          <Button disabled={busy || editVersion !== t.version}>儲存內容</Button>
        </form>
      ) : (
        <div className="detail-block context-grid">
          {[
            ['目標', t.goal],
            ['背景脈絡', t.context],
            ['驗收條件', t.acceptance],
          ].map(([label, value]) => (
            <div key={label}>
              <h3>{label}</h3>
              <p className={value ? '' : 'muted'}>{value || '尚未填寫'}</p>
            </div>
          ))}
        </div>
      )}
      <div className="detail-block">
        <h3>
          全部步驟{' '}
          <small>
            {t.steps.filter((s) => s.completed_at).length} / {t.steps.length}
          </small>
        </h3>
        {t.steps.length === 0 && (
          <p className="muted">還沒有步驟，從下一步開始。</p>
        )}
        <div className="steps-list">
          {t.steps.map((s) => (
            <div
              className={s.completed_at ? 'step-row completed' : 'step-row'}
              key={s.id}
            >
              <Checkbox
                checked={!!s.completed_at}
                disabled={busy}
                aria-label={`${s.completed_at ? '恢復' : '完成'}步驟：${s.title}`}
                onCheckedChange={() =>
                  act(
                    t,
                    {
                      op: s.completed_at ? 'reopen_step' : 'complete_step',
                      step_id: s.id,
                    },
                    () =>
                      setSaved(
                        s.completed_at
                          ? '步驟已恢復為未完成。'
                          : '步驟已完成，請確認下一步。',
                      ),
                  )
                }
              />
              <span>{s.title}</span>
              <small>{dateTime(s.completed_at)}</small>
            </div>
          ))}
        </div>
        {!completed && (
          <>
            <p role="status" className="text-sm text-primary">
              {saved}
            </p>
            <NextStepForm
              stepCompleted={false}
              key={t.id}
              task={t}
              act={act}
              busy={busy}
              onDone={() => setSaved('下一步已儲存。')}
            />
          </>
        )}
      </div>
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
      <div className="detail-block">
        <h3>進展歷程</h3>
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
      </div>
      {!completed && (
        <div className="finish-task">
          <div>
            <h3>整件事都完成了？</h3>
            <p>確認目標與驗收條件都已達成，再勾下這個大勾勾。</p>
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
