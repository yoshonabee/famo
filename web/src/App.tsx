import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
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
  GripVertical,
  Inbox,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  PanelRightOpen,
  Settings,
  Trash2,
} from 'lucide-react'
import { BoardEditor } from '@/components/board-editor'
import { BoardHeading } from '@/components/board-heading'
import { getBoardIcon } from '@/components/board-icons'
import { PreferencesPage } from '@/components/preferences-page'
import {
  NavigationButton,
  PrimaryNavigation,
  type PrimaryNavItem,
} from '@/components/primary-navigation'
import { ProjectBadge } from '@/components/project-appearance'
import { ProjectEditor } from '@/components/project-editor'
import { ProjectPicker } from '@/components/project-picker'
import { RecentlyDeletedPage } from '@/components/recently-deleted-page'
import { ProjectNavigation } from '@/components/sidebar-collection'
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle'
import {
  TodayProjectFilter,
  useTodayProjectFilter,
} from '@/components/today-project-filter'
import { useTheme } from '@/lib/theme'
import {
  isDesktop,
  openBoardEvent,
  openSettingsEvent,
  shortcutEvent,
} from '@/lib/desktop'
import { DatePicker } from '@/components/date-picker'
import { CalendarDate, DateNavigation } from '@/components/date-navigation'
import { CalendarPage } from '@/components/calendar-page'
import { formatTaskDate, localDate } from '@/lib/calendar'
import { linkLabel } from '@/lib/links'
import {
  orderSidebarItems,
  useSidebarPreferences,
} from '@/lib/sidebar-preferences'
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
import { TaskProjectAssignment } from '@/components/task-project-assignment'
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
import { useLanguage } from '@/lib/i18n'
import { useTaskSelection } from '@/lib/task-selection'

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
  ['shift+f', 'global-search'],
])
const defaultNavigation = ['date', 'active', 'completed']
const initialBoardId = new URLSearchParams(window.location.search).get('board')

function Links({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { t } = useLanguage()
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
          aria-label={t(
            task.links.length === 3 ? 'viewOneMoreLink' : 'viewMoreLinks',
            task.links.length - 2,
            task.title,
          )}
        >
          +{task.links.length - 2}
        </button>
      )}
    </div>
  )
}
function App() {
  const { t, errorText, locale } = useLanguage()
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
  const [requestedView, setView] = useState<
    | 'active'
    | 'date'
    | 'completed'
    | 'recently-deleted'
    | 'preferences'
    | 'project'
    | 'board'
    | 'menu-bar-today'
  >(
    initialBoardId === null
      ? 'date'
      : initialBoardId
        ? 'board'
        : 'menu-bar-today',
  )
  const boards = useQuery({
    queryKey: ['boards'],
    queryFn: ({ signal }) => request<Board[]>('/boards', undefined, signal),
    refetchInterval: 30_000,
  })
  const boardList = boards.data ?? []
  const sidebar = useSidebarPreferences()
  const { showToday, order, footerItems, width } = sidebar.preferences
  const [resizingWidth, setResizingWidth] = useState<number | null>(null)
  const sidebarWidth = resizingWidth ?? width ?? (locale === 'en' ? 192 : 168)
  const boardsByNavId = new Map(
    boardList.map((board) => [`board:${board.id}`, board]),
  )
  const orderedNavIds = orderSidebarItems(
    [...defaultNavigation, ...boardsByNavId.keys()],
    order,
  )
  const [boardId, setBoardId] = useState(initialBoardId ?? undefined)
  const [boardEditor, setBoardEditor] = useState<Board | 'new' | null>(null)
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: ({ signal }) => request<Project[]>('/projects', undefined, signal),
    refetchInterval: 30_000,
  })
  const projectList = projects.data ?? []
  const [projectId, setProjectId] = useState<string>()
  const [projectEditor, setProjectEditor] = useState<Project | 'new' | null>(
    null,
  )
  const projectsById = new Map(
    projectList.map((project) => [project.id, project]),
  )
  const editProject =
    projectEditor && projectEditor !== 'new'
      ? (projectsById.get(projectEditor.id) ?? projectEditor)
      : undefined
  let view = requestedView === 'menu-bar-today' ? 'date' : requestedView
  let currentBoard =
    view === 'board' ? boardsByNavId.get(`board:${boardId}`) : undefined
  if (
    (view === 'board' && !currentBoard) ||
    (view === 'project' && !projectsById.has(projectId ?? ''))
  )
    view = 'date'
  if (view === 'date' && !showToday && requestedView !== 'menu-bar-today') {
    const firstBoardId = orderedNavIds.find((id) => boardsByNavId.has(id))
    currentBoard = boardsByNavId.get(firstBoardId ?? '')
    view = currentBoard ? 'board' : 'active'
  }
  const currentProjectId = view === 'project' ? projectId : undefined
  const currentProject = projectsById.get(currentProjectId ?? '')
  const boardProjectIds = currentBoard
    ? new Set(currentBoard.project_ids)
    : null
  const isCalendarView = view === 'date' || view === 'board'
  const [date, setDate] = useState(localDate)
  const todayFilter = useTodayProjectFilter()
  const today = localDate()
  const isToday = view === 'date' && date === today
  const projectFiltered = isToday && todayFilter.hidden.length > 0
  const [search, setSearch] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [palette, setPalette] = useState<
    'capture' | 'search' | 'global-search' | null
  >(null)
  const [paletteCaptureDate, setPaletteCaptureDate] = useState('')
  const [paletteCaptureProjectId, setPaletteCaptureProjectId] = useState('')
  const captureProjects = boardProjectIds
    ? projectList.filter((project) => boardProjectIds.has(project.id))
    : projectList
  const selectedCaptureProjectId = captureProjects.some(
    (project) => project.id === paletteCaptureProjectId,
  )
    ? paletteCaptureProjectId
    : ''
  const requireCaptureProject = !!boardProjectIds?.size
  const multiProjectBoard = (boardProjectIds?.size ?? 0) > 1
  const defaultCaptureProjectId =
    currentBoard?.project_ids.length === 1
      ? currentBoard.project_ids[0]
      : currentProjectId
  const capture = useQuickCapture(
    () => setSearch(''),
    isCalendarView ? date : '',
    defaultCaptureProjectId,
  )
  const visibleDrafts = capture.drafts.filter((draft) => {
    if (boardProjectIds)
      return (
        draft.scheduled_date === date &&
        boardProjectIds.has(draft.project_id ?? '')
      )
    if (view === 'date') return draft.scheduled_date === date
    if (view === 'project') return draft.project_id === currentProjectId
    return true
  })
  const [selected, setSelected] = useState<string | null>(null)
  function openCapture() {
    if (currentBoard && !requireCaptureProject)
      setView(showToday ? 'date' : 'active')
    if (palette !== 'capture') {
      setPaletteCaptureDate(isCalendarView ? date : today)
      setPaletteCaptureProjectId(defaultCaptureProjectId ?? '')
    }
    setPalette('capture')
  }
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
  function goToToday(fromMenuBar = false) {
    setDate(localDate())
    if (fromMenuBar) {
      setView('menu-bar-today')
      setSearch('')
    } else if (!showToday && currentBoard) {
      setBoardId(currentBoard.id)
      setView('board')
    } else setView('date')
    setSelected(null)
    setPalette(null)
    window.scrollTo(0, 0)
  }
  const openBoard = useEffectEvent((id: unknown) => {
    if (typeof id !== 'string') return
    if (id === '') {
      goToToday(true)
      return
    }
    void client.invalidateQueries({ queryKey: ['boards'] })
    setDate(localDate())
    goToBoard(id)
  })
  const runShortcut = useEffectEvent((action: unknown) => {
    if (projectEditor !== null || boardEditor !== null) return
    switch (action) {
      case 'sidebar':
        setSidebarCollapsed((collapsed) => !collapsed)
        break
      case 'capture':
        openCapture()
        break
      case 'today':
        goToToday()
        break
      case 'global-search':
        setPalette('global-search')
        break
      case 'search':
        if (view === 'preferences') goToToday()
        setPalette('search')
        break
    }
  })
  useEffect(() => {
    function onOpenBoard(event: Event) {
      openBoard((event as CustomEvent<unknown>).detail)
    }
    window.addEventListener(openBoardEvent, onOpenBoard)
    return () => window.removeEventListener(openBoardEvent, onOpenBoard)
  }, [])
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
        event.altKey
      )
        return
      const action = shortcuts.get(
        (event.shiftKey ? 'shift+' : '') + event.key.toLowerCase(),
      )
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
  const [message, setMessage] = useState<{
    error: string
    reorder?: boolean
  } | null>(null)
  const projectOrder = useMutation({
    mutationFn: (ids: string[]) =>
      request('/projects/reorder', { project_ids: ids }),
    onError: (error) => setMessage({ error: error.message, reorder: true }),
    onSettled: () => client.invalidateQueries({ queryKey: ['projects'] }),
  })
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
      setMessage({ error: error.message, reorder: true })
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
      else setMessage({ error: e.message })
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const act: Act = (t, action, done, failed) =>
    mutation.mutate({ t, action, failed }, { onSuccess: done })
  const assignment = useMutation({
    onMutate: () => setMessage(null),
    mutationFn: ({ projectId, items }: { projectId: string; items: Task[] }) =>
      request<Task[]>('/tasks/assign-project', {
        project_id: projectId,
        tasks: items.map(({ id, version }) => ({ id, version })),
      }),
    onSuccess: async (updated) => {
      await client.cancelQueries({ queryKey: ['tasks'] })
      const updatedById = new Map(updated.map((task) => [task.id, task]))
      client.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((task) => {
          const assigned = updatedById.get(task.id)
          return assigned && assigned.version > task.version ? assigned : task
        }),
      )
      selection.clear()
    },
    onError: (error) => {
      setMessage({ error: error.message })
      void client.invalidateQueries({ queryKey: ['projects'] })
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['tasks'] }),
  })
  const all = tasks.data ?? []
  const active = all.filter((t) => !t.completed_at)
  const searchTerm = search.toLowerCase()
  const matchesSearch = (task: Task) =>
    `${task.title} ${task.description}`.toLowerCase().includes(searchTerm)
  const matching = all.filter(
    (t) =>
      (view !== 'project' || t.project_id === currentProjectId) &&
      matchesSearch(t),
  )
  const filtered = matching.filter((t) => !t.completed_at)
  const completed = matching
    .filter((t) => t.completed_at)
    .sort(compareCompletionTime)
  const listTitle =
    view === 'project'
      ? currentProject?.name
      : view === 'active'
        ? t('tasks')
        : t('completed')
  const listCount =
    view === 'project'
      ? matching.length
      : view === 'completed'
        ? completed.length
        : filtered.length
  const busy = mutation.isPending || reorder.isPending || assignment.isPending
  const calendarTasks = isCalendarView
    ? all.filter((task) => {
        const id = task.project_id ?? ''
        if (boardProjectIds) return boardProjectIds.has(id)
        return !projectFiltered || !todayFilter.hidden.includes(id)
      })
    : []
  const selectableTasks = isCalendarView
    ? calendarTasks.filter(
        (task) => task.scheduled_date === date && matchesSearch(task),
      )
    : view === 'active'
      ? filtered
      : view === 'completed'
        ? completed
        : view === 'project'
          ? matching
          : []
  const selectionScope = JSON.stringify([
    view,
    currentBoard?.id,
    currentProjectId,
    isCalendarView ? date : null,
    search,
    projectFiltered ? todayFilter.hidden : null,
  ])
  const selection = useTaskSelection(selectionScope, busy || dragging)
  const selectedIds = new Set(selection.ids)
  const chosenTasks = selectableTasks.filter((task) => selectedIds.has(task.id))
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
        dateKind={
          isCalendarView
            ? undefined
            : view === 'completed'
              ? 'completed'
              : 'scheduled'
        }
        hideCompletion={hideCompletion}
        sortableDisabled={sortableDisabled || visibleDrafts.length > 0}
        busy={busy}
        selectedForBatch={!hideCompletion && selectedIds.has(task.id)}
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
  const sidebarAction = sidebarCollapsed
    ? t('expandSidebar')
    : t('collapseSidebar')
  const navItems = new Map<string, PrimaryNavItem>([
    [
      'date',
      {
        id: 'date',
        label: t('today'),
        icon: CalendarDays,
        current: view === 'date',
        ariaLabel: t('todayTasks'),
        shortcut: 'Meta+K Control+K',
        onSelect: () => goToToday(),
      },
    ],
    [
      'active',
      {
        id: 'active',
        label: t('tasks'),
        icon: Inbox,
        current: view === 'active',
        ariaLabel: t('taskList'),
        count: active.length,
        onSelect: () => setView('active'),
      },
    ],
    [
      'completed',
      {
        id: 'completed',
        label: t('completed'),
        icon: CheckCheck,
        current: view === 'completed',
        count: all.length - active.length,
        onSelect: () => setView('completed'),
      },
    ],
  ])
  for (const [id, board] of boardsByNavId) {
    navItems.set(id, {
      id,
      label: board.name,
      icon: getBoardIcon(board.icon),
      current: currentBoard?.id === board.id,
      onSelect: () => goToBoard(board.id),
      onEdit: () => setBoardEditor(board),
    })
  }
  const footerNavIds = new Set<string>(footerItems)
  const visibleNavIds = orderedNavIds.filter(
    (id) => (showToday || id !== 'date') && !footerNavIds.has(id),
  )
  const visibleNavItems = visibleNavIds.map((id) => navItems.get(id)!)
  function reorderNavigation(ids: string[]) {
    if (currentBoard && requestedView === 'date') {
      setBoardId(currentBoard.id)
      setView('board')
    }
    const visible = new Set(visibleNavIds)
    let index = 0
    sidebar.save({
      order: orderedNavIds.map((id) => (visible.has(id) ? ids[index++] : id)),
    })
  }
  return (
    <div
      className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}
      data-has-batch-selection={chosenTasks.length > 0 || undefined}
      data-resizing-sidebar={resizingWidth !== null || undefined}
      style={
        { '--expanded-sidebar-width': `${sidebarWidth}px` } as CSSProperties
      }
    >
      <div className="window-titlebar" aria-hidden="true" />
      <aside className="sidebar" id="app-sidebar">
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
        <PrimaryNavigation
          items={visibleNavItems}
          collapsed={sidebarCollapsed}
          error={errorText(boards.error)}
          onReorder={reorderNavigation}
          onCreate={() => setBoardEditor('new')}
          onRetry={() => void boards.refetch()}
        />
        <ProjectNavigation
          projects={
            projectOrder.isPending
              ? orderSubset(projectList, projectOrder.variables)
              : projectList
          }
          current={currentProjectId}
          collapsed={sidebarCollapsed}
          reordering={projectOrder.isPending}
          error={errorText(projects.error)}
          onSelect={goToProject}
          onExpand={() => setSidebarCollapsed(false)}
          onCreate={() => setProjectEditor('new')}
          onEdit={(id) => setProjectEditor(projectsById.get(id) ?? null)}
          onReorder={(ids) => projectOrder.mutate(ids)}
          onRetry={() => void projects.refetch()}
        />
        <SidebarResizeHandle
          width={sidebarWidth}
          onResize={setResizingWidth}
          onSave={(width) => sidebar.save({ width })}
        />
        <div className="sidebar-footer">
          {orderedNavIds
            .filter((id) => footerNavIds.has(id))
            .map((id) => (
              <NavigationButton key={id} item={navItems.get(id)!} />
            ))}
          <button
            className={
              view === 'recently-deleted' ? 'nav-item active' : 'nav-item'
            }
            onClick={() => setView('recently-deleted')}
            aria-current={view === 'recently-deleted' ? 'page' : undefined}
            aria-label={t('recentlyDeleted')}
            title={t('recentlyDeleted')}
          >
            <Trash2 size={17} />
            <span className="nav-label">{t('recentlyDeleted')}</span>
          </button>
          <button
            className={view === 'preferences' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('preferences')}
            aria-current={view === 'preferences' ? 'page' : undefined}
            aria-label={t('settings')}
            title={t('settings')}
          >
            <Settings size={17} />
            <span className="nav-label">{t('settings')}</span>
          </button>
        </div>
      </aside>
      <main onClick={selection.onBackgroundClick}>
        <div
          className="main-content"
          data-has-batch-selection={chosenTasks.length > 0 || undefined}
          hidden={view === 'preferences' || view === 'recently-deleted'}
          {...selection.handlers}
        >
          {isCalendarView ? (
            <header className="calendar-heading">
              {currentBoard ? (
                <BoardHeading
                  key={currentBoard.id}
                  board={currentBoard}
                  date={date}
                />
              ) : (
                <h1>
                  <CalendarDate date={date} />
                </h1>
              )}
              <DateNavigation date={date} onChange={setDate} />
              {searchField}
            </header>
          ) : (
            <div className="list-toolbar">
              <div className="list-title">
                <h1>{listTitle}</h1>
                <span className="list-count">{listCount}</span>
              </div>
              {searchField}
            </div>
          )}
          {isToday && (projectList.length > 0 || projectFiltered) && (
            <TodayProjectFilter projects={projectList} filter={todayFilter} />
          )}
          <QuickCapture
            hidden={
              !isActiveList && view !== 'date' && !defaultCaptureProjectId
            }
            onSubmit={capture.submit}
            announcement={capture.announcement}
          />
          {multiProjectBoard && (
            <button
              type="button"
              className="capture-entry board-capture-button"
              aria-keyshortcuts="Meta+T Control+T"
              onClick={openCapture}
            >
              <Plus size={17} aria-hidden="true" />
              {t('addTask')}
            </button>
          )}
          {isCalendarView && (
            <CalendarPage
              date={date}
              key={`${currentBoard?.id ?? 'date'}/${date}`}
              tasks={calendarTasks}
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
              {t('loading')}
            </div>
          )}
          {tasks.isError && (
            <div role="alert" className="state">
              {t('loadTasksError', errorText(tasks.error))}
              <Button variant="outline" onClick={() => void tasks.refetch()}>
                {t('reload')}
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
                    view === 'project'
                      ? t('projectOpenTasks')
                      : t('mainTaskList')
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
                    {search ? t('noMatches') : t('noTasks')}
                  </div>
                )}
            </>
          )}
          {tasks.isSuccess &&
            (view === 'completed' || view === 'project') &&
            completed.length > 0 && (
              <section
                className={view === 'project' ? 'daily-completed' : undefined}
                aria-label={
                  view === 'project' ? t('projectCompleted') : undefined
                }
              >
                {view === 'project' && <h2>{t('completed')}</h2>}
                <DragDropProvider>
                  <ul
                    className="task-list"
                    aria-label={
                      view === 'project'
                        ? t('projectCompletedTasks')
                        : t('completedTaskList')
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
              {search ? t('noMatchingTasks') : t('noCompletedTasks')}
            </div>
          )}
          <TaskProjectAssignment
            projects={projectList}
            selectedCount={chosenTasks.length}
            allSelected={chosenTasks.length === selectableTasks.length}
            busy={busy}
            onSelectAll={() =>
              selection.selectAll(selectableTasks.map((task) => task.id))
            }
            onClear={selection.clear}
            onAssign={(projectId) =>
              assignment.mutate({ projectId, items: chosenTasks })
            }
          />
        </div>
        {view === 'recently-deleted' && (
          <div className="main-content">
            <RecentlyDeletedPage search={search} onSearchChange={setSearch} />
          </div>
        )}
        <div className="main-content" hidden={view !== 'preferences'}>
          <PreferencesPage
            appearance={theme}
            showToday={showToday}
            footerItems={footerItems}
            onShowTodayChange={(showToday) => sidebar.save({ showToday })}
            onFooterChange={(id, move) => {
              sidebar.save({
                footerItems: move
                  ? [...footerItems, id]
                  : footerItems.filter((item) => item !== id),
              })
            }}
          />
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
            key={boardEditor === 'new' ? 'new' : boardEditor.id}
            board={boardEditor === 'new' ? undefined : boardEditor}
            projects={projects.data}
            projectsError={errorText(projects.error)}
            onRetryProjects={() => void projects.refetch()}
            onSaved={(saved) => {
              if (boardEditor === 'new') goToBoard(saved.id)
              setBoardEditor(null)
            }}
            onDeleted={(id) => {
              if (currentBoard?.id === id) {
                setView('date')
                setDate(localDate())
                setSearch('')
              }
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
            key={projectEditor === 'new' ? 'new' : projectEditor.id}
            project={editProject}
            onSaved={(saved) => {
              if (projectEditor === 'new') goToProject(saved.id)
              setProjectEditor(null)
            }}
            onDeleted={(id) => {
              if (currentProjectId === id) {
                setView('date')
                setDate(localDate())
                setSearch('')
              }
              setProjectEditor(null)
            }}
          />
        )}
      </Dialog>
      <TaskPalette
        mode={palette}
        tasks={all}
        tasksLoading={tasks.isPending}
        tasksError={tasks.isError ? errorText(tasks.error) : ''}
        onOpenTask={(id) => {
          setPalette(null)
          setSelected(id)
        }}
        onClose={() => setPalette(null)}
        capture={capture}
        captureDate={paletteCaptureDate}
        captureProjects={captureProjects}
        captureProjectId={selectedCaptureProjectId}
        requireCaptureProject={requireCaptureProject}
        onCaptureDateChange={setPaletteCaptureDate}
        onCaptureProjectChange={setPaletteCaptureProjectId}
        search={search}
        onSearchChange={setSearch}
      />
      {message && (
        <div className="toast" role="alert">
          <span>
            {message.reorder
              ? t('reorderFailed', errorText(message.error))
              : errorText(message.error)}
          </span>
          <button
            aria-label={t('dismissNotice')}
            onClick={() => setMessage(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
function TaskRow({
  task,
  dateKind,
  project,
  busy,
  onOpen,
  onComplete,
  onSetDate,
  index,
  sortableDisabled = false,
  hideCompletion = false,
  selectedForBatch,
}: {
  task: Task
  project?: Project
  dateKind?: 'scheduled' | 'completed'
  busy: boolean
  onOpen: () => void
  onComplete: () => void
  onSetDate: (date: string) => void
  index: number
  sortableDisabled?: boolean
  hideCompletion?: boolean
  selectedForBatch: boolean
}) {
  const { t, locale } = useLanguage()
  const completed = !!task.completed_at
  const rowDate =
    dateKind === 'scheduled'
      ? task.scheduled_date
      : dateKind === 'completed' && task.completed_at
        ? localDate(new Date(task.completed_at))
        : ''
  const displayDate = formatTaskDate(rowDate, locale)
  const title = task.title
  const { ref, handleRef, isDragging } = useSortable({
    id: task.id,
    index,
    disabled: completed || sortableDisabled,
  })
  return (
    <li
      ref={ref}
      data-task-id={task.id}
      data-selectable-task={hideCompletion ? undefined : task.id}
      data-batch-selected={selectedForBatch || undefined}
      tabIndex={hideCompletion ? undefined : 0}
      aria-label={
        hideCompletion
          ? undefined
          : t(selectedForBatch ? 'selectedTask' : 'selectTask', title)
      }
      aria-keyshortcuts={
        hideCompletion ? undefined : 'Space Shift+ArrowUp Shift+ArrowDown'
      }
      className={`task-row ${completed ? 'is-completed' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <div className="todo-line">
        <button
          ref={handleRef}
          className="drag-handle"
          disabled={completed || sortableDisabled}
          aria-label={t('dragTask', title)}
          title={t('dragToReorder')}
        >
          <GripVertical size={16} />
        </button>
        {!hideCompletion && (
          <Checkbox
            checked={completed}
            disabled={busy}
            aria-label={t(
              completed ? 'reopenNamedTask' : 'completeNamedTask',
              title,
            )}
            onCheckedChange={onComplete}
          />
        )}
        <TodoTitle task={task} title={title} onDeleted={() => {}} />
        <Links task={task} onOpen={onOpen} />
        {project && <ProjectBadge project={project} />}
        {rowDate && (
          <time
            className="task-row-date"
            dateTime={rowDate}
            title={t(
              dateKind === 'completed' ? 'completedAt' : 'taskDateValue',
              displayDate,
            )}
          >
            {displayDate}
          </time>
        )}
        <DatePicker
          date={task.scheduled_date}
          onChange={onSetDate}
          label={t('setTaskDate', title)}
          title={
            task.scheduled_date
              ? t('taskDateValue', formatTaskDate(task.scheduled_date, locale))
              : t('setDate')
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
          aria-label={t('taskDetails', title)}
          title={t('notesAndLinks')}
        >
          <PanelRightOpen size={15} />
        </button>
      </div>
    </li>
  )
}
function Detail({
  task,
  projects,
  act,
  busy,
}: {
  task: Task
  projects?: Project[]
  act: Act
  busy: boolean
}) {
  const { t, locale, errorText } = useLanguage()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [projectError, setProjectError] = useState('')
  const completed = !!task.completed_at
  const CompletionIcon = completed ? SolidCheckCircle : OutlineCheckCircle
  function addLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    setLinkError('')
    act(
      task,
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
    act(
      task,
      { op: 'remove_link', link_index: index },
      undefined,
      setRemoveError,
    )
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
            '.inline-content-editor, .calendar-popover, .project-picker-popup',
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
          aria-label={completed ? t('markIncomplete') : t('completeTask')}
          title={completed ? t('markIncomplete') : t('completeTask')}
          onCheckedChange={() =>
            act(task, { op: completed ? 'reopen_task' : 'complete_task' })
          }
        >
          <CompletionIcon width={20} height={20} />
        </Checkbox>
        <DialogTitle className="dialog-title" aria-label={task.title}>
          <InlineContent task={task} field="title" busy={busy} />
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('taskDetailsDescription')}
        </DialogDescription>
      </div>
      <div className="detail-meta">
        <TaskDate task={task} busy={busy} />
        {projects && projects.length > 0 && (
          <div className="task-project-field">
            <span className="task-date-label">Project</span>
            <ProjectPicker
              label="Project"
              projects={projects}
              value={task.project_id ?? ''}
              disabled={busy}
              onChange={(projectId) => {
                setProjectError('')
                act(
                  task,
                  { op: 'update', project_id: projectId },
                  undefined,
                  setProjectError,
                )
              }}
            />
            {projectError && (
              <p className="inline-edit-error" role="alert">
                {errorText(projectError)}
              </p>
            )}
          </div>
        )}
        {completed && (
          <span>{t('completedAt', dateTime(task.completed_at, locale))}</span>
        )}
      </div>
      <div className="detail-block">
        <h3>{t('notes')}</h3>
        <InlineContent task={task} field="description" busy={busy} />
      </div>
      <div className="detail-block">
        <div className="block-heading">
          <h3>{t('relatedLinks')}</h3>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-expanded={adding}
            onClick={() => setAdding(!adding)}
          >
            <Plus />
            {t('addLink')}
          </Button>
        </div>
        {task.links.length ? (
          <div className="detail-links">
            {task.links.map((l, i) => (
              <div className="detail-link" key={`${l.url}-${i}`}>
                <a href={l.url} target="_blank" rel="noreferrer" title={l.url}>
                  <span>{linkLabel(l.url)}</span>
                  <span>{l.url}</span>
                  <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  className="row-action-button remove-link-button"
                  aria-label={t('deleteNamedLink', l.url)}
                  title={t('deleteLink')}
                  disabled={busy}
                  onClick={() => removeLink(i)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{t('noLinks')}</p>
        )}
        {removeError && (
          <p className="inline-edit-error" role="alert">
            {errorText(removeError)}
          </p>
        )}
        {adding && (
          <form onSubmit={addLink}>
            <div className="link-form">
              <label className="field">
                <span>{t('linkUrl')}</span>
                <input
                  name="url"
                  aria-label={t('linkUrl')}
                  type="url"
                  pattern="https?://.*"
                  placeholder={t('pasteUrl')}
                  required
                  autoFocus
                  readOnly={busy}
                />
              </label>
              <Button disabled={busy} size="sm">
                {t('add')}
              </Button>
            </div>
            {linkError && (
              <p className="inline-edit-error" role="alert">
                {t('linkDraftError', errorText(linkError))}
              </p>
            )}
          </form>
        )}
      </div>
    </DialogContent>
  )
}
export default App
