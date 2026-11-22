import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, Search } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { ProjectPicker } from '@/components/project-picker'
import {
  CaptureAnnouncement,
  CaptureDraftRow,
  CaptureEntry,
  type useQuickCapture,
} from '@/components/quick-capture'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Project, Task } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'
import { formatTaskDate } from '@/lib/calendar'

export function TaskSearch({
  value,
  onChange,
  onDone,
}: {
  value: string
  onChange: (value: string) => void
  onDone?: () => void
}) {
  const { t } = useLanguage()
  return (
    <label className="search">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label={t('searchTasks')}
        placeholder={t('search')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            onDone &&
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault()
            onDone()
          }
        }}
      />
    </label>
  )
}

export function TaskPalette({
  mode,
  mobile,
  tasks,
  tasksLoading,
  tasksError,
  onOpenTask,
  onClose,
  capture,
  captureDate,
  captureProjects,
  captureProjectId,
  requireCaptureProject,
  onCaptureDateChange,
  onCaptureProjectChange,
  search,
  onSearchChange,
}: {
  mode: 'capture' | 'search' | 'global-search' | null
  mobile: boolean
  tasks: Task[]
  tasksLoading: boolean
  tasksError: string
  onOpenTask: (id: string) => void
  onClose: () => void
  capture: ReturnType<typeof useQuickCapture>
  captureDate: string
  captureProjects: Project[]
  captureProjectId: string
  requireCaptureProject: boolean
  onCaptureDateChange: (date: string) => void
  onCaptureProjectChange: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
}) {
  const { t, locale } = useLanguage()
  const content = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const drafts = capture.drafts.filter((draft) => draft.floating)
  const isCapture = mode === 'capture'
  const isMobileCapture = mobile && isCapture
  useEffect(() => {
    const input = content.current?.querySelector('input')
    input?.focus({ preventScroll: true })
    if (mode !== 'capture') input?.select()
  }, [mode])

  const setContent = useCallback(
    (sheet: HTMLDivElement | null) => {
      content.current = sheet
      const viewport = window.visualViewport
      if (!isMobileCapture || !sheet || !viewport) return

      const fitKeyboard = () => {
        const inset = Math.max(
          0,
          window.innerHeight - viewport.height - viewport.offsetTop,
        )
        sheet.style.setProperty('--keyboard-inset', `${inset}px`)
        sheet.style.setProperty('--visible-height', `${viewport.height}px`)
      }
      fitKeyboard()
      viewport.addEventListener('resize', fitKeyboard)
      viewport.addEventListener('scroll', fitKeyboard)
      return () => {
        content.current = null
        viewport.removeEventListener('resize', fitKeyboard)
        viewport.removeEventListener('scroll', fitKeyboard)
        sheet.style.removeProperty('--keyboard-inset')
        sheet.style.removeProperty('--visible-height')
      }
    },
    [isMobileCapture],
  )

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      {mode && (
        <DialogContent
          ref={setContent}
          className={`task-palette ${isMobileCapture ? 'mobile-sheet mobile-capture-sheet' : ''}`}
          showCloseButton={!isCapture || mobile}
          onEscapeKeyDown={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('.calendar-popover, .project-picker-popup')
            )
              event.preventDefault()
          }}
          onOpenAutoFocus={(event) => {
            if (document.activeElement instanceof HTMLElement)
              returnFocus.current = document.activeElement
            const input = content.current?.querySelector('input')
            if (!input) return
            event.preventDefault()
            input.focus({ preventScroll: true })
            if (!isCapture) input.select()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocus.current?.focus({ preventScroll: true })
          }}
        >
          <DialogTitle className={isMobileCapture ? 'dialog-title' : 'sr-only'}>
            {isCapture
              ? t('quickCapture')
              : mode === 'global-search'
                ? t('searchAllTasks')
                : t('searchTasks')}
          </DialogTitle>
          {isCapture ? (
            <>
              <CaptureEntry
                canSubmit={!requireCaptureProject || !!captureProjectId}
                onSubmit={(title) =>
                  capture.submit(title, {
                    scheduledDate: captureDate,
                    projectId: captureProjectId,
                  })
                }
              />
              <DialogDescription className="sr-only">
                {t('captureHelp')}
              </DialogDescription>
              <div className="task-palette-hint task-palette-date">
                <DatePicker
                  date={captureDate}
                  onChange={(value) => {
                    onCaptureDateChange(value)
                    content.current
                      ?.querySelector('input')
                      ?.focus({ preventScroll: true })
                  }}
                  label={t(
                    'captureTaskDate',
                    formatTaskDate(captureDate, locale),
                  )}
                  buttonClassName="task-palette-date-button"
                  align="start"
                >
                  <CalendarDays size={14} />
                  {formatTaskDate(captureDate, locale)}
                  <ChevronDown size={12} />
                </DatePicker>
                {(captureProjects.length > 0 || requireCaptureProject) && (
                  <ProjectPicker
                    projects={captureProjects}
                    value={captureProjectId}
                    allowUnassigned={!requireCaptureProject}
                    label={t('captureTaskProject')}
                    buttonClassName="task-palette-date-button"
                    onChange={(id) => {
                      onCaptureProjectChange(id)
                      content.current
                        ?.querySelector('input')
                        ?.focus({ preventScroll: true })
                    }}
                  />
                )}
              </div>
            </>
          ) : mode === 'global-search' ? (
            <GlobalTaskSearch
              tasks={tasks}
              loading={tasksLoading}
              error={tasksError}
              onOpenTask={onOpenTask}
            />
          ) : (
            <>
              <TaskSearch
                value={search}
                onChange={onSearchChange}
                onDone={onClose}
              />
              <DialogDescription className="task-palette-hint">
                {t('searchHelp')}
              </DialogDescription>
            </>
          )}
          {isCapture && drafts.length > 0 && (
            <ul className="task-palette-drafts" aria-label={t('captureDrafts')}>
              {drafts.map((draft) => (
                <CaptureDraftRow
                  key={draft.id}
                  draft={draft}
                  retry={capture.retry}
                />
              ))}
            </ul>
          )}
          {isCapture && (
            <CaptureAnnouncement announcement={capture.announcement} />
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

function GlobalTaskSearch({
  tasks,
  loading,
  error,
  onOpenTask,
}: {
  tasks: Task[]
  loading: boolean
  error: string
  onOpenTask: (id: string) => void
}) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const term = query.trim().toLowerCase()
  const matches = term
    ? tasks.filter((task) =>
        `${task.title} ${task.description}`.toLowerCase().includes(term),
      )
    : []
  return (
    <>
      <TaskSearch
        value={query}
        onChange={setQuery}
        onDone={() => matches[0] && onOpenTask(matches[0].id)}
      />
      <DialogDescription className="task-palette-hint">
        {t('globalSearchHelp')}
      </DialogDescription>
      {term && !matches.length && (
        <p role="status" className="task-palette-hint">
          {error
            ? t('loadTasksError', error)
            : loading
              ? t('loading')
              : t('noMatches')}
        </p>
      )}
      {matches.length > 0 && (
        <ul className="global-search-results">
          {matches.map((task) => (
            <li key={task.id}>
              <button type="button" onClick={() => onOpenTask(task.id)}>
                <span>{task.title}</span>
                {task.completed_at && <small>{t('completed')}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
