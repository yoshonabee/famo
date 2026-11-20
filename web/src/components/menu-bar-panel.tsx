import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Circle, RefreshCw } from 'lucide-react'
import { MenuBarBoardPicker } from '@/components/menu-bar-board-picker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ApiError, request, type Board, type Task } from '@/lib/api'
import { localDate } from '@/lib/calendar'
import { hideMenuBar, openFamo, selectMenuBarBoard } from '@/lib/desktop'
import {
  orderSidebarItems,
  useSidebarPreferences,
} from '@/lib/sidebar-preferences'
import { useTheme } from '@/lib/theme'
import { useLanguage } from '@/lib/i18n'

const boardStorageKey = 'famo.menu-bar.board'

function MenuBarTask({ task }: { task: Task }) {
  const { t, errorText } = useLanguage()
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
        aria-label={t(
          task.completed_at ? 'reopenNamedTask' : 'completeNamedTask',
          task.title,
        )}
        checked={!!task.completed_at}
        disabled={toggle.isPending}
        onCheckedChange={() => toggle.mutate(task)}
      />
      <div className="menu-bar-task-body">
        <span className="menu-bar-task-title">{task.title}</span>
        {toggle.isError && (
          <p className="menu-bar-task-error" role="alert">
            {toggle.error instanceof ApiError && toggle.error.status === 409
              ? t('menuTaskConflict')
              : t('menuTaskUpdateFailed', errorText(toggle.error))}
          </p>
        )}
      </div>
    </li>
  )
}

export function MenuBarPanel() {
  const { t } = useLanguage()
  useTheme()
  const [date, setDate] = useState(localDate)
  const [openError, setOpenError] = useState<
    'openFamoFailed' | 'closePanelFailed' | null
  >(null)
  const [boardId, setBoardId] = useState(() => {
    try {
      return localStorage.getItem(boardStorageKey)
    } catch {
      return null
    }
  })
  const { preferences } = useSidebarPreferences()
  const boards = useQuery({
    queryKey: ['boards'],
    queryFn: ({ signal }) => request<Board[]>('/boards', undefined, signal),
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  })
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: ({ signal }) => request<Task[]>('/tasks', undefined, signal),
    refetchInterval: 2_000,
    refetchOnWindowFocus: 'always',
  })
  useEffect(() => {
    const update = () => setDate(localDate())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void hideMenuBar().catch(() => setOpenError('closePanelFailed'))
      }
    }
    const timer = window.setInterval(update, 1_000)
    window.addEventListener('focus', update)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
  const boardsByNavId = new Map(
    boards.data?.map((board) => [`board:${board.id}`, board]),
  )
  const orderedBoards = orderSidebarItems(
    [...boardsByNavId.keys()],
    preferences.order,
  ).map((id) => boardsByNavId.get(id)!)
  const showToday = preferences.showToday || orderedBoards.length === 0
  const currentBoard =
    showToday && boardId === ''
      ? undefined
      : (boardsByNavId.get(`board:${boardId}`) ?? orderedBoards[0])
  const selectedBoardId = currentBoard?.id ?? ''
  useEffect(() => {
    if (!boards.isPending) selectMenuBarBoard(selectedBoardId)
  }, [boards.isPending, selectedBoardId])
  const projectIds = currentBoard ? new Set(currentBoard.project_ids) : null
  const loading = tasks.isPending || boards.isPending
  const today = loading
    ? []
    : (tasks.data ?? []).filter(
        (task) =>
          task.scheduled_date === date &&
          !task.deleted_at &&
          (!projectIds || projectIds.has(task.project_id ?? '')),
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
        <MenuBarBoardPicker
          boards={orderedBoards}
          board={currentBoard}
          showToday={showToday}
          onChange={(id) => {
            setBoardId(id)
            try {
              localStorage.setItem(boardStorageKey, id)
            } catch {
              // Keep the selection in the current panel if storage is unavailable.
            }
          }}
        />
        <div className="menu-bar-heading-actions">
          <time dateTime={date}>{date.replaceAll('-', '/')}</time>
          <Button
            size="sm"
            disabled={boards.isPending}
            onClick={() => {
              setOpenError(null)
              void openFamo(selectedBoardId).catch(() =>
                setOpenError('openFamoFailed'),
              )
            }}
          >
            {t('openFamo')} <ArrowUpRight size={12} />
          </Button>
        </div>
      </header>
      {openError && (
        <p className="menu-bar-heading-error" role="alert">
          {t(openError)}
        </p>
      )}
      {boards.isLoadingError && (
        <p className="menu-bar-heading-error" role="alert">
          {t('loadBoardFailed')}{' '}
          <button type="button" onClick={() => void boards.refetch()}>
            {t('retry')}
          </button>
        </p>
      )}
      <section className="menu-bar-progress" aria-label={t('todayProgress')}>
        <div>
          <h1>{t('todayTasks')}</h1>
          <span>{loading || tasks.isError ? '—' : `${percentage}%`}</span>
        </div>
        <progress
          aria-label={t('todayCompletionRate')}
          max={Math.max(today.length, 1)}
          value={tasks.isError ? 0 : completed}
        />
        <p role="status">
          {tasks.isError
            ? t('progressUnavailable')
            : loading
              ? t('loadingToday')
              : today.length
                ? t(
                    completed === today.length
                      ? 'panelAllCompleted'
                      : 'panelProgress',
                    completed,
                    today.length,
                  )
                : t('nothingScheduledToday')}
        </p>
      </section>
      <div className="menu-bar-tasks">
        {tasks.isError ? (
          <div className="menu-bar-empty" role="alert">
            <p>{t('loadTasksFailed')}</p>
            <Button variant="outline" onClick={() => void tasks.refetch()}>
              <RefreshCw size={14} /> {t('retry')}
            </Button>
          </div>
        ) : !loading && today.length === 0 ? (
          <div className="menu-bar-empty">
            <Circle size={28} aria-hidden="true" />
            {currentBoard ? (
              <p>{t('boardEmptyToday')}</p>
            ) : (
              <>
                <p>{t('menuEmptyEncouragement')}</p>
                <span>{t('menuEmptyNextStep')}</span>
              </>
            )}
          </div>
        ) : (
          <ul aria-label={t('todayTaskList')}>
            {ordered.map((task) => (
              <MenuBarTask key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>
      <footer className="menu-bar-version">
        famo {import.meta.env.FAMO_VERSION}
      </footer>
    </div>
  )
}
