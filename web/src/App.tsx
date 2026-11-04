import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import {
  CalendarDays,
  CheckCheck,
  ExternalLink,
  GripVertical,
  Inbox,
  Layers3,
  LoaderCircle,
  Plus,
  PanelRightOpen,
  Search,
  Settings2,
  Link2,
  Trash2,
} from 'lucide-react'
import { DateNavigation } from '@/components/date-navigation'
import { CalendarPage } from '@/components/calendar-page'
import { localDate } from '@/lib/calendar'
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
  orderSubset,
  request,
  type Action,
  type Task,
  type Settings,
} from '@/lib/api'

type Act = (t: Task, action: Action, done?: (updated: Task) => void) => void
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
  const [view, setView] = useState<
    'active' | 'date' | 'completed' | 'settings' | 'link-settings'
  >('active')
  const [date, setDate] = useState(localDate)
  const [search, setSearch] = useState('')
  const [create, setCreate] = useState(false)
  const capture = useQuickCapture(
    () => setSearch(''),
    view === 'date' ? date : '',
  )
  const visibleDrafts = capture.drafts.filter((draft) =>
    view === 'date' ? draft.scheduled_date === date : true,
  )
  const [captureFocus, setCaptureFocus] = useState(0)
  function startCapture() {
    if (view !== 'date') setView('active')
    setCaptureFocus((count) => count + 1)
  }
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
      `${t.title} ${t.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const detail = all.find((t) => t.id === selected)
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Layers3 size={18} />
          </span>
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
          <button
            className={view === 'settings' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('settings')}
            aria-label="下拉選項設定"
          >
            <Settings2 size={17} />
            選項
          </button>
          <button
            className={
              view === 'link-settings' ? 'nav-item active' : 'nav-item'
            }
            onClick={() => setView('link-settings')}
            aria-label="連結種類設定"
          >
            <Link2 size={17} />
            連結種類
          </button>
        </nav>
      </aside>
      <main>
        <div className="main-content">
          {view === 'settings' || view === 'link-settings' ? (
            settings.data ? (
              <SettingsPage
                key={view}
                settings={settings.data}
                section={view === 'link-settings' ? 'links' : 'tasks'}
              />
            ) : (
              <p role="status">{settings.error?.message ?? '讀取設定中…'}</p>
            )
          ) : (
            <>
              {view === 'date' && (
                <header className="calendar-heading">
                  <h1>
                    <time dateTime={date}>
                      {new Date(`${date}T12:00:00`).toLocaleDateString(
                        'zh-TW',
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        },
                      )}
                    </time>
                    <span className="date-weekday">
                      {new Date(`${date}T12:00:00`).toLocaleDateString(
                        'zh-TW',
                        { weekday: 'long' },
                      )}
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
                <div className="toolbar-actions">
                  <Button size="sm" onClick={startCapture}>
                    <Plus />
                    新增任務
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreate(true)}
                  >
                    完整表單
                  </Button>
                </div>
              </div>
              <QuickCapture
                hidden={view !== 'active' && view !== 'date'}
                focusRequest={captureFocus}
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
                  onMove={async (task) => {
                    await mutation.mutateAsync({
                      t: task,
                      action: { op: 'update', scheduled_date: date },
                    })
                  }}
                  renderTask={(task, index, disabled) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      index={index}
                      sortableDisabled={disabled || visibleDrafts.length > 0}
                      busy={mutation.isPending}
                      act={act}
                      onOpen={() => setSelected(task.id)}
                      onComplete={() =>
                        act(task, {
                          op: task.completed_at
                            ? 'reopen_task'
                            : 'complete_task',
                        })
                      }
                      settings={settings.data}
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
                  <Button
                    variant="outline"
                    onClick={() => void tasks.refetch()}
                  >
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
                          act={act}
                          onOpen={() => setSelected(t.id)}
                          onComplete={() => act(t, { op: 'complete_task' })}
                          settings={settings.data}
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
                    {search ? '沒有符合的任務。' : '尚無已完成任務'}
                  </div>
                ))}
            </>
          )}
        </div>
      </main>
      <CreateDialog
        open={create}
        onOpenChange={setCreate}
        settings={settings.data}
        defaultDate={view === 'date' ? date : ''}
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
function CreateDialog({
  open,
  onOpenChange,
  settings,
  defaultDate,
}: {
  defaultDate: string
  open: boolean
  onOpenChange: (v: boolean) => void
  settings?: Settings
}) {
  const client = useQueryClient()
  const [chosenType, setType] = useState('')
  const [links, setLinks] = useState<
    { id: string; type_id: string; url: string }[]
  >([])
  useEffect(() => {
    if (open) {
      setType('')
      setLinks([])
      create.reset()
    }
  }, [open])
  const workflows = settings?.workflows ?? []
  const type = chosenType || settings?.default_type || ''
  const create = useMutation({
    mutationFn: (body: unknown) => request<Task>('/tasks', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['tasks'] })
      onOpenChange(false)
    },
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    create.mutate({
      title: f.get('title'),
      description: f.get('description'),
      scheduled_date: f.get('scheduled_date'),
      type,
      priority: Number(f.get('priority')),
      links: links.map(({ type_id, url }) => ({ type_id, url })),
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
        <DialogTitle className="dialog-title">新增任務</DialogTitle>
        <DialogDescription className="sr-only">
          任務內容與相關連結
        </DialogDescription>
        <form onSubmit={submit} className="stack-form">
          <Field label="任務名稱">
            <input
              name="title"
              autoFocus
              required
              placeholder="任務名稱"
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
          <Field label="任務日期（選填）">
            <input
              name="scheduled_date"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              defaultValue={defaultDate}
            />
          </Field>
          <Field label="描述">
            <textarea name="description" placeholder="描述（選填）" rows={3} />
          </Field>
          <fieldset className="create-links" disabled={create.isPending}>
            <legend>相關連結（選填）</legend>
            {links.map((link, index) => (
              <div
                className="create-link-row"
                role="group"
                aria-label={`連結 ${index + 1}`}
                key={link.id}
              >
                <Field label={`連結種類 ${index + 1}`}>
                  <OptionSelect
                    label={`連結種類 ${index + 1}`}
                    options={settings?.link_types ?? []}
                    value={link.type_id}
                    colored={false}
                    onChange={(type_id) =>
                      setLinks((current) =>
                        current.map((item) =>
                          item.id === link.id ? { ...item, type_id } : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label={`URL ${index + 1}`}>
                  <input
                    type="url"
                    required
                    pattern="https?://.*"
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) =>
                      setLinks((current) =>
                        current.map((item) =>
                          item.id === link.id
                            ? { ...item, url: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                <button
                  className="remove-link"
                  type="button"
                  aria-label={`移除連結 ${index + 1}`}
                  onClick={() =>
                    setLinks((current) =>
                      current.filter((item) => item.id !== link.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!settings?.link_types.some((type) => !type.disabled)}
              onClick={() =>
                setLinks((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    type_id: settings?.default_link_type ?? '',
                    url: '',
                  },
                ])
              }
            >
              <Plus />
              新增連結
            </Button>
          </fieldset>
          {create.isError && (
            <p role="alert" className="capture-error">
              {create.error.message}
            </p>
          )}
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
        links: [
          { type_id: String(f.get('type_id')), url: String(f.get('url')) },
        ],
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
        <DialogTitle className="dialog-title" aria-label={t.title}>
          <InlineContent task={t} field="title" busy={busy} />
        </DialogTitle>
        <DialogDescription className="sr-only">任務詳細資料</DialogDescription>
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
        <div className="scheduled-date-field">
          <span>任務日期</span>
          <InlineContent task={t} field="scheduled_date" busy={busy} />
        </div>
        {completed && <span>已完成 · {dateTime(t.completed_at)}</span>}
      </div>
      <div className="detail-block">
        <h3>描述</h3>
        <InlineContent task={t} field="description" busy={busy} />
      </div>
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
          <p className="muted">尚無連結</p>
        )}
        {adding && (
          <form className="link-form" onSubmit={addLink}>
            <Field label="連結種類">
              <OptionSelect
                label="連結種類"
                colored={false}
                name="type_id"
                options={settings?.link_types ?? []}
                defaultValue={settings?.default_link_type}
                disabled={busy}
              />
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
            <Button
              disabled={
                busy || !settings?.link_types.some((type) => !type.disabled)
              }
              size="sm"
            >
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
