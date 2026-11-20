import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { CheckCircleIcon as OutlineCheckCircle } from '@heroicons/react/24/outline'
import { CheckCircleIcon as SolidCheckCircle } from '@heroicons/react/24/solid'
import {
  CalendarDays,
  CheckCheck,
  ExternalLink,
  Folder,
  GripVertical,
  Inbox,
  LayoutGrid,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  PanelRightOpen,
  Settings,
  Trash2,
} from 'lucide-react'
import { BoardEditor } from '@/components/board-editor'
import { PreferencesPage } from '@/components/preferences-page'
import { ProjectBadge, ProjectColorDot } from '@/components/project-appearance'
import { ProjectEditor } from '@/components/project-editor'
import { RecentlyDeletedPage } from '@/components/recently-deleted-page'
import { SidebarCollection } from '@/components/sidebar-collection'
import {
  TodayProjectFilter,
  useTodayProjectFilter,
} from '@/components/today-project-filter'
import { useTheme } from '@/lib/theme'
import { isDesktop, openSettingsEvent, shortcutEvent } from '@/lib/desktop'
import { DatePicker } from '@/components/date-picker'
import { CalendarDate, DateNavigation } from '@/components/date-navigation'
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
import { TaskPalette, TaskSearch } from '@/components/task-palette'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ApiError,
  compareCompletionTime,
  dateTime,
  orderSubset,
  request,
  type Action,
  type Board,
  type Project,
  type Task,
} from '@/lib/api'

type Act = (
  t: Task,
  action: Action,
  done?: (updated: Task) => void,
  failed?: (message: string) => void,
) => void
const shortcuts = new Map([
  ['d', 'sidebar'],
  ['t', 'capture'],
  ['k', 'today'],
  ['f', 'search'],
])

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
  const theme = useTheme()
  const [dragging, setDragging] = useState(false)
  const [ordering, setOrdering] = useState(false)
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: ({ signal }) => request<Task[]>('/tasks', undefined, signal),
    enabled: !dragging && !ordering,
    refetchInterval: 30_000,
  })
  const [view, setView] = useState<
    | 'active'
    | 'date'
    | 'completed'
    | 'recently-deleted'
    | 'preferences'
    | 'project'
    | 'board'
  >('date')
  const boards = useQuery({
    queryKey: ['boards'],
    queryFn: ({ signal }) => request<Board[]>('/boards', undefined, signal),
    refetchInterval: 30_000,
  })
  const boardList = boards.data ?? []
  const [boardId, setBoardId] = useState<string>()
  const [boardEditor, setBoardEditor] = useState<string | null>(null)
  const currentBoard =
    view === 'board' ? boardList.find(({ id }) => id === boardId) : undefined
  const editBoard = boardList.find(({ id }) => id === boardEditor)
  const boardProjectIds = currentBoard
    ? new Set(currentBoard.project_ids)
    : null
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => request<Project[]>('/projects', undefined, signal),
    refetchInterval: 30_000,
  })
  const projectList = projects.data ?? []
  const [projectId, setProjectId] = useState<string>()
  const [projectEditor, setProjectEditor] = useState<string | null>(null)
  const currentProjectId = view === 'project' ? projectId : undefined
  const currentProject = projectList.find(({ id }) => id === currentProjectId)
  const editProject = projectList.find(({ id }) => id === projectEditor)
  const projectsById = new Map(
    projectList.map((project) => [project.id, project]),
  )
  const [date, setDate] = useState(localDate)
  const todayFilter = useTodayProjectFilter()
  const today = localDate()
  const calendarDate = currentBoard ? today : date
  const isToday = view === 'date' && date === today
  const projectFiltered = isToday && todayFilter.hidden.length > 0
  const [search, setSearch] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [palette, setPalette] = useState<'capture' | 'search' | null>(null)
  const [paletteCaptureDate, setPaletteCaptureDate] = useState('')
  const captureProjectId =
    currentBoard?.project_ids.length === 1
      ? currentBoard.project_ids[0]
      : currentProjectId
  const capture = useQuickCapture(
    () => setSearch(''),
    view === 'date' || currentBoard ? calendarDate : '',
    captureProjectId,
  )
  const visibleDrafts = capture.drafts.filter((draft) => {
    if (boardProjectIds)
      return (
        draft.scheduled_date === calendarDate &&
        boardProjectIds.has(draft.project_id ?? '')
      )
    if (view === 'date') return draft.scheduled_date === date
    if (view === 'project') return draft.project_id === currentProjectId
    return true
  })
  const [selected, setSelected] = useState<string | null>(null)
  function goToBoard(id: string) {
    setBoardId(id)
    setView('board')
    setSelected(null)
    setPalette(null)
    setSearch('')
    window.scrollTo(0, 0)
  }
  function goToProject(id: string) {
    setProjectId(id)
    setView('project')
    setSelected(null)
    setPalette(null)
    setSearch('')
    window.scrollTo(0, 0)
  }
  function goToToday() {
    setDate(localDate())
    setView('date')
    setSelected(null)
    setPalette(null)
    window.scrollTo(0, 0)
  }
  const runShortcut = useEffectEvent((action: unknown) => {
    if (projectEditor !== null || boardEditor !== null) return
    switch (action) {
      case 'sidebar':
        setSidebarCollapsed((collapsed) => !collapsed)
        break
      case 'capture':
        if (currentBoard && !captureProjectId) goToToday()
        if (palette !== 'capture')
          setPaletteCaptureDate(view === 'date' ? date : today)
        setPalette('capture')
        break
      case 'today':
        goToToday()
        break
      case 'search':
        if (view === 'preferences') goToToday()
        setPalette('search')
        break
    }
  })
  useEffect(() => {
    const openSettings = () => {
      setSelected(null)
      setPalette(null)
      setView('preferences')
      window.scrollTo(0, 0)
    }
    window.addEventListener(openSettingsEvent, openSettings)
    return () => window.removeEventListener(openSettingsEvent, openSettings)
  }, [])
  useEffect(() => {
    function onShortcut(event: Event) {
      runShortcut((event as CustomEvent<unknown>).detail)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.metaKey === event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return
      const action = shortcuts.get(event.key.toLowerCase())
      if (!action) return
      event.preventDefault()
      if (!event.repeat) runShortcut(action)
    }
    if (isDesktop()) {
      window.addEventListener(shortcutEvent, onShortcut)
      return () => window.removeEventListener(shortcutEvent, onShortcut)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
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
      }),
    onSuccess: (t) => {
      client.setQueryData<Task[]>(['tasks'], (old) =>
        t.deleted_at
          ? old?.filter((item) => item.id !== t.id)
          : old?.map((item) => (item.id === t.id ? t : item)),
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
  const matching = all.filter(
    (t) =>
      (view !== 'project' || t.project_id === currentProjectId) &&
      `${t.title} ${t.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const filtered = matching.filter((t) => !t.completed_at)
  const completed = matching
    .filter((t) => t.completed_at)
    .sort(compareCompletionTime)
  const listTitle =
    currentBoard?.name ??
    (view === 'project'
      ? currentProject?.name
      : view === 'active'
        ? '任務'
        : '已完成')
  const listCount =
    view === 'project'
      ? matching.length
      : view === 'completed'
        ? completed.length
        : filtered.length
  const busy = mutation.isPending || reorder.isPending
  function renderTask(
    task: Task,
    index: number,
    sortableDisabled: boolean,
    hideCompletion?: boolean,
  ) {
    return (
      <TaskRow
        key={task.id}
        task={task}
        index={index}
        project={
          view !== 'project' && task.project_id
            ? projectsById.get(task.project_id)
            : undefined
        }
        hideCompletion={hideCompletion}
        sortableDisabled={sortableDisabled || visibleDrafts.length > 0}
        busy={busy}
        onSetDate={(date) => act(task, { op: 'update', scheduled_date: date })}
        onOpen={() => setSelected(task.id)}
        onComplete={() =>
          act(task, {
            op: task.completed_at ? 'reopen_task' : 'complete_task',
          })
        }
      />
    )
  }
  const isActiveList = view === 'active' || view === 'project'
  const detail = all.find((t) => t.id === selected)
  const searchField = <TaskSearch value={search} onChange={setSearch} />
  const SidebarIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose
  const sidebarAction = sidebarCollapsed ? '展開側邊欄' : '收合側邊欄'
  return (
    <div
      className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}
    >
      <div className="window-titlebar" aria-hidden="true" />
      <aside className="sidebar">
        <div className="sidebar-heading">
          <a className="brand" href="/" aria-label="Famo">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">famo</span>
          </a>
          <Button
            className="sidebar-toggle"
            variant="ghost"
            size="icon"
            aria-label={sidebarAction}
            aria-expanded={!sidebarCollapsed}
            aria-keyshortcuts="Meta+D Control+D"
            title={`${sidebarAction} (⌘D)`}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <SidebarIcon />
          </Button>
        </div>
        <nav aria-label="主要導覽">
          <button
            className={view === 'date' ? 'nav-item active' : 'nav-item'}
            onClick={goToToday}
            aria-label="今日任務"
            aria-keyshortcuts="Meta+K Control+K"
            title="今日 (⌘K)"
          >
            <CalendarDays size={17} />
            <span className="nav-label">今日</span>
          </button>
          <button
            className={view === 'active' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('active')}
            aria-label="任務列表"
            title="任務"
          >
            <Inbox size={17} />
            <span className="nav-label">任務</span>
            <span className="nav-count">{active.length}</span>
          </button>
          <button
            className={view === 'completed' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('completed')}
            aria-label="已完成"
            title="已完成"
          >
            <CheckCheck size={17} />
            <span className="nav-label">已完成</span>
            <span className="nav-count">{all.length - active.length}</span>
          </button>
        </nav>
        <SidebarCollection
          name="Board"
          items={boardList}
          icon={LayoutGrid}
          current={currentBoard?.id}
          collapsed={sidebarCollapsed}
          error={boards.error?.message}
          onSelect={goToBoard}
          onExpand={() => setSidebarCollapsed(false)}
          onCreate={() => setBoardEditor('new')}
          onRetry={() => void boards.refetch()}
        />
        <SidebarCollection
          name="Project"
          items={projectList}
          icon={Folder}
          renderItemIcon={(project) => (
            <ProjectColorDot color={project.color} />
          )}
          current={currentProjectId}
          collapsed={sidebarCollapsed}
          error={projects.error?.message}
          onSelect={goToProject}
          onExpand={() => setSidebarCollapsed(false)}
          onCreate={() => setProjectEditor('new')}
          onRetry={() => void projects.refetch()}
        />
        <div className="sidebar-footer">
          <button
            className={
              view === 'recently-deleted' ? 'nav-item active' : 'nav-item'
            }
            onClick={() => setView('recently-deleted')}
            aria-current={view === 'recently-deleted' ? 'page' : undefined}
            aria-label="最近刪除"
            title="最近刪除"
          >
            <Trash2 size={17} />
            <span className="nav-label">最近刪除</span>
          </button>
          <button
            className={view === 'preferences' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('preferences')}
            aria-current={view === 'preferences' ? 'page' : undefined}
            aria-label="設定"
            title="設定"
          >
            <Settings size={17} />
            <span className="nav-label">設定</span>
          </button>
        </div>
      </aside>
      <main>
        <div
          className="main-content"
          hidden={view === 'preferences' || view === 'recently-deleted'}
        >
          {view === 'date' && (
            <header className="calendar-heading">
              <h1>
                <CalendarDate date={date} />
              </h1>
              <DateNavigation date={date} onChange={setDate} />
              {searchField}
            </header>
          )}
          {view !== 'date' && (
            <div className="list-toolbar">
              <div className="list-title">
                <h1>{listTitle}</h1>
                {!currentBoard && (
                  <span className="list-count">{listCount}</span>
                )}
                {currentBoard && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="編輯 Board"
                    title="編輯 Board"
                    onClick={() => setBoardEditor(currentBoard.id)}
                  >
                    <Pencil />
                  </Button>
                )}
                {currentProject && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="編輯 Project"
                    title="編輯 Project"
                    onClick={() => setProjectEditor(currentProject.id)}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
              {currentBoard && (
                <p className="board-date">
                  今日 <CalendarDate date={calendarDate} />
                </p>
              )}
              {searchField}
            </div>
          )}
          {isToday && (projectList.length > 0 || projectFiltered) && (
            <TodayProjectFilter projects={projectList} filter={todayFilter} />
          )}
          <QuickCapture
            hidden={!isActiveList && view !== 'date' && !captureProjectId}
            onSubmit={capture.submit}
            announcement={capture.announcement}
          />
          {(view === 'date' || currentBoard) && (
            <CalendarPage
              date={calendarDate}
              key={`${currentBoard?.id ?? 'date'}/${calendarDate}`}
              tasks={all.filter((task) => {
                const id = task.project_id ?? ''
                if (boardProjectIds) return boardProjectIds.has(id)
                return !projectFiltered || !todayFilter.hidden.includes(id)
              })}
              projectFiltered={projectFiltered || !!currentBoard}
              search={search}
              loading={!tasks.isSuccess}
              busy={busy}
              onReorder={(ids) => reorder.mutate(ids)}
              onDragging={setDragging}
              onMove={async (task, targetDate) => {
                await mutation.mutateAsync({
                  t: task,
                  action: { op: 'update', scheduled_date: targetDate },
                })
              }}
              renderTask={renderTask}
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
          {tasks.isSuccess && isActiveList && (
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
                <ul
                  className="task-list"
                  aria-label={
                    view === 'project' ? 'Project 未完成任務' : '主要任務列表'
                  }
                >
                  {filtered.map((t, index) => renderTask(t, index, busy))}
                  {visibleDrafts.map((draft) => (
                    <CaptureDraftRow
                      key={draft.id}
                      draft={draft}
                      retry={capture.retry}
                    />
                  ))}
                </ul>
              </DragDropProvider>
              {!filtered.length &&
                !visibleDrafts.length &&
                (view === 'active' || !completed.length) && (
                  <div className="empty-list">
                    {search ? '沒有符合的任務' : '尚無任務'}
                  </div>
                )}
            </>
          )}
          {tasks.isSuccess &&
            (view === 'completed' || view === 'project') &&
            completed.length > 0 && (
              <section
                className={view === 'project' ? 'daily-completed' : undefined}
                aria-label={view === 'project' ? 'Project 已完成' : undefined}
              >
                {view === 'project' && <h2>已完成</h2>}
                <DragDropProvider>
                  <ul
                    className="task-list"
                    aria-label={
                      view === 'project'
                        ? 'Project 已完成任務'
                        : '已完成任務列表'
                    }
                  >
                    {completed.map((t, index) => renderTask(t, index, true))}
                  </ul>
                </DragDropProvider>
              </section>
            )}
          {tasks.isSuccess && view === 'completed' && !completed.length && (
            <div className="state">
              <CheckCheck />
              {search ? '沒有符合的任務。' : '尚無已完成任務'}
            </div>
          )}
        </div>
        {view === 'recently-deleted' && (
          <div className="main-content">
            <RecentlyDeletedPage search={search} onSearchChange={setSearch} />
          </div>
        )}
        <div className="main-content" hidden={view !== 'preferences'}>
          <PreferencesPage appearance={theme} />
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
            projects={projects.data}
            act={act}
            busy={busy}
          />
        )}
      </Dialog>
      <Dialog
        open={boardEditor !== null}
        onOpenChange={(open) => !open && setBoardEditor(null)}
      >
        {boardEditor !== null && (
          <BoardEditor
            key={boardEditor}
            board={editBoard}
            projects={projects.data}
            projectsError={projects.error?.message}
            onRetryProjects={() => void projects.refetch()}
            onSaved={(saved) => {
              if (boardEditor === 'new') goToBoard(saved.id)
              setBoardEditor(null)
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={projectEditor !== null}
        onOpenChange={(open) => !open && setProjectEditor(null)}
      >
        {projectEditor !== null && (
          <ProjectEditor
            key={projectEditor}
            project={editProject}
            onSaved={(saved) => {
              if (projectEditor === 'new') goToProject(saved.id)
              setProjectEditor(null)
            }}
          />
        )}
      </Dialog>
      <TaskPalette
        mode={palette}
        onClose={() => setPalette(null)}
        capture={capture}
        captureDate={paletteCaptureDate}
        captureProject={
          captureProjectId ? projectsById.get(captureProjectId) : undefined
        }
        onCaptureDateChange={setPaletteCaptureDate}
        search={search}
        onSearchChange={setSearch}
      />
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
  project,
  busy,
  onOpen,
  onComplete,
  onSetDate,
  index,
  sortableDisabled = false,
  hideCompletion = false,
}: {
  task: Task
  project?: Project
  busy: boolean
  onOpen: () => void
  onComplete: () => void
  onSetDate: (date: string) => void
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
        {project && <ProjectBadge project={project} />}
        <DatePicker
          date={t.scheduled_date}
          onChange={onSetDate}
          label={`設定日期：${title}`}
          title={
            t.scheduled_date ? `任務日期：${t.scheduled_date}` : '設定日期'
          }
          buttonClassName="row-action-button"
          clearable
          disabled={busy}
        >
          <CalendarDays size={15} />
        </DatePicker>
        <button
          className="row-action-button row-detail-button"
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
  projects,
  act,
  busy,
}: {
  task: Task
  projects?: Project[]
  act: Act
  busy: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [projectError, setProjectError] = useState('')
  const completed = !!t.completed_at
  const CompletionIcon = completed ? SolidCheckCircle : OutlineCheckCircle
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
  function removeLink(index: number) {
    setRemoveError('')
    act(t, { op: 'remove_link', link_index: index }, undefined, setRemoveError)
  }

  return (
    <DialogContent
      ref={dialogRef}
      className="task-detail-dialog max-w-3xl"
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        dialogRef.current?.focus({ preventScroll: true })
      }}
      onEscapeKeyDown={(event) => {
        if (
          (event.target as Element)?.closest(
            '.inline-content-editor, .calendar-popover',
          )
        )
          event.preventDefault()
      }}
    >
      <div className="detail-heading">
        <Checkbox
          className="detail-completion size-5 rounded-full border-0 bg-transparent text-muted-foreground/75 data-[state=checked]:bg-transparent data-[state=checked]:text-primary"
          checked={completed}
          disabled={busy}
          aria-label={completed ? '恢復為未完成' : '完成任務'}
          title={completed ? '恢復為未完成' : '完成任務'}
          onCheckedChange={() =>
            act(t, { op: completed ? 'reopen_task' : 'complete_task' })
          }
        >
          <CompletionIcon width={20} height={20} />
        </Checkbox>
        <DialogTitle className="dialog-title" aria-label={t.title}>
          <InlineContent task={t} field="title" busy={busy} />
        </DialogTitle>
        <DialogDescription className="sr-only">
          日期、Project、備註與相關連結
        </DialogDescription>
      </div>
      <div className="detail-meta">
        <TaskDate task={t} busy={busy} />
        {projects && projects.length > 0 && (
          <div className="task-project-field">
            <label>
              <span className="task-date-label">Project</span>
              <select
                value={t.project_id ?? ''}
                disabled={busy}
                onChange={(event) => {
                  setProjectError('')
                  act(
                    t,
                    { op: 'update', project_id: event.target.value },
                    undefined,
                    setProjectError,
                  )
                }}
              >
                <option value="">未分類</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            {projectError && (
              <p className="inline-edit-error" role="alert">
                {projectError}
              </p>
            )}
          </div>
        )}
        {completed && <span>已完成 · {dateTime(t.completed_at)}</span>}
      </div>
      <div className="detail-block">
        <h3>備註</h3>
        <InlineContent task={t} field="description" busy={busy} />
      </div>
      <div className="detail-block">
        <div className="block-heading">
          <h3>相關連結</h3>
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
        </div>
        {t.links.length ? (
          <div className="detail-links">
            {t.links.map((l, i) => (
              <div className="detail-link" key={`${l.url}-${i}`}>
                <a href={l.url} target="_blank" rel="noreferrer" title={l.url}>
                  <span>{linkLabel(l.url)}</span>
                  <span>{l.url}</span>
                  <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  className="row-action-button remove-link-button"
                  aria-label={`刪除連結：${l.url}`}
                  title="刪除連結"
                  disabled={busy}
                  onClick={() => removeLink(i)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">尚無連結</p>
        )}
        {removeError && (
          <p className="inline-edit-error" role="alert">
            {removeError}
          </p>
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
    </DialogContent>
  )
}
export default App
