import { useState } from 'react'
import { Trigger } from '@radix-ui/react-dialog'
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Folder,
  Inbox,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { getBoardIcon } from '@/components/board-icons'
import { DatePicker } from '@/components/date-picker'
import { ProjectColorDot } from '@/components/project-appearance'
import { SyncStatusIndicator } from '@/components/sync-status-indicator'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Board, Project } from '@/lib/api'
import { formatTaskDate } from '@/lib/calendar'
import { useLanguage } from '@/lib/i18n'

export type MobileList =
  'active' | 'board' | 'completed' | 'date' | 'recently-deleted' | 'statistics'

export function MobileHeading({
  title,
  board,
  boards,
  boardError,
  list,
  date,
  onDateChange,
  onBoard,
  onEditBoard,
  onAddBoard,
  onRetryBoards,
  onList,
  onProjects,
  onEditProject,
}: {
  title: string
  board?: Board
  boards: Board[]
  boardError: string
  list?: MobileList
  date?: string
  onDateChange: (date: string) => void
  onBoard: (id: string) => void
  onEditBoard: (board: Board) => void
  onAddBoard: () => void
  onRetryBoards: () => void
  onList: (view: MobileList) => void
  onProjects?: () => void
  onEditProject?: () => void
}) {
  const { t, locale } = useLanguage()
  const [open, setOpen] = useState(false)
  const ActiveIcon = board ? getBoardIcon(board.icon) : LayoutGrid
  const lists = [
    { id: 'date', label: t('today'), Icon: CalendarDays },
    { id: 'active', label: t('tasks'), Icon: Inbox },
    { id: 'completed', label: t('completed'), Icon: CheckCheck },
    {
      id: 'statistics',
      label: t('statistics'),
      Icon: ChartNoAxesColumnIncreasing,
    },
    { id: 'recently-deleted', label: t('recentlyDeleted'), Icon: Trash2 },
  ] as const
  function choose(action: () => void) {
    setOpen(false)
    action()
  }
  return (
    <header className="mobile-workspace-heading">
      <div className="mobile-heading-line">
        <h1>
          {list ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <Trigger asChild>
                <button
                  type="button"
                  className="mobile-board-trigger"
                  aria-label={t('mobileSwitchBoard', title)}
                >
                  <ActiveIcon size={22} aria-hidden="true" />
                  <span>{title}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              </Trigger>
              <DialogContent className="mobile-sheet mobile-board-sheet">
                <DialogTitle className="dialog-title">
                  {t('mobileBoards')}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {t('mobileBoardMenuDescription')}
                </DialogDescription>
                {boardError && (
                  <p className="inline-edit-error" role="alert">
                    {boardError}{' '}
                    <button type="button" onClick={onRetryBoards}>
                      {t('retry')}
                    </button>
                  </p>
                )}
                <ul className="mobile-list-options">
                  {boards.map((item) => {
                    const Icon = getBoardIcon(item.icon)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="mobile-list-option"
                          aria-current={
                            item.id === board?.id ? 'page' : undefined
                          }
                          onClick={() => choose(() => onBoard(item.id))}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span>{item.name}</span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('editCollection', 'Board', item.name)}
                          onClick={() => choose(() => onEditBoard(item))}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
                <button
                  className="mobile-list-option mobile-add-board"
                  type="button"
                  onClick={() => choose(onAddBoard)}
                >
                  <Plus size={18} aria-hidden="true" />
                  {t('addBoard')}
                </button>
                <ul className="mobile-list-options mobile-special-lists">
                  {lists.map(({ id, label, Icon }) => (
                    <li key={id}>
                      <button
                        type="button"
                        className="mobile-list-option"
                        aria-current={id === list ? 'page' : undefined}
                        onClick={() => choose(() => onList(id))}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </DialogContent>
            </Dialog>
          ) : (
            title
          )}
        </h1>
        <SyncStatusIndicator />
      </div>
      {date && (
        <DatePicker
          date={date}
          onChange={onDateChange}
          label={t('openCalendar')}
          buttonClassName="mobile-display-date"
          align="start"
        >
          <time dateTime={date}>{formatTaskDate(date, locale)}</time>
          <ChevronDown size={13} aria-hidden="true" />
        </DatePicker>
      )}
      {onProjects && onEditProject && (
        <div className="mobile-project-actions">
          <Button variant="ghost" onClick={onProjects}>
            {t('mobileProjects')}
          </Button>
          <Button variant="outline" onClick={onEditProject}>
            {t('editProject')}
          </Button>
        </div>
      )}
    </header>
  )
}

export function MobileProjects({
  projects,
  loading,
  error,
  onOpen,
  onEdit,
  onAdd,
  onRetry,
}: {
  projects: Project[]
  loading: boolean
  error: string
  onOpen: (id: string) => void
  onEdit: (project: Project) => void
  onAdd: () => void
  onRetry: () => void
}) {
  const { t } = useLanguage()
  return (
    <section className="mobile-projects" aria-label={t('mobileProjects')}>
      <div className="mobile-project-actions">
        <Button variant="outline" onClick={onAdd}>
          {t('addProject')}
        </Button>
      </div>
      {loading && (
        <p className="state" role="status">
          {t('loadingProjects')}
        </p>
      )}
      {error && (
        <div className="state" role="alert">
          {error}
          <Button variant="outline" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      )}
      {!loading && !error && !projects.length && (
        <p className="muted">{t('noProjects')}</p>
      )}
      <ul className="mobile-list-options">
        {projects.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              className="mobile-list-option"
              onClick={() => onOpen(project.id)}
            >
              <ProjectColorDot color={project.color} />
              <span>{project.name}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('editCollection', 'Project', project.name)}
              onClick={() => onEdit(project)}
            >
              <Pencil size={16} aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MobileNavigation({
  projects,
  searching,
  onBoards,
  onProjects,
  onSearch,
  onCapture,
}: {
  projects: boolean
  searching: boolean
  onBoards: () => void
  onProjects: () => void
  onSearch: () => void
  onCapture: () => void
}) {
  const { t } = useLanguage()
  return (
    <>
      <button
        type="button"
        className="mobile-capture-button"
        aria-label={t('quickCapture')}
        aria-haspopup="dialog"
        onClick={onCapture}
      >
        <Plus size={27} aria-hidden="true" />
      </button>
      <nav className="mobile-navigation" aria-label={t('mainNavigation')}>
        <button
          type="button"
          aria-current={!projects && !searching ? 'page' : undefined}
          onClick={onBoards}
        >
          <LayoutGrid size={20} aria-hidden="true" />
          {t('mobileBoards')}
        </button>
        <button
          type="button"
          aria-current={projects && !searching ? 'page' : undefined}
          onClick={onProjects}
        >
          <Folder size={20} aria-hidden="true" />
          {t('mobileProjects')}
        </button>
        <button
          type="button"
          aria-current={searching ? 'page' : undefined}
          aria-label={t('searchAllTasks')}
          aria-haspopup="dialog"
          onClick={onSearch}
        >
          <Search size={20} aria-hidden="true" />
          {t('search')}
        </button>
      </nav>
    </>
  )
}
