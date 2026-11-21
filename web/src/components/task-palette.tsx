import { useEffect, useRef } from 'react'
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
import type { Project } from '@/lib/api'
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
  mode: 'capture' | 'search' | null
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
  useEffect(() => {
    const input = content.current?.querySelector('input')
    input?.focus({ preventScroll: true })
    if (mode === 'search') input?.select()
  }, [mode])

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      {mode && (
        <DialogContent
          ref={content}
          className="task-palette"
          showCloseButton={!isCapture}
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
          <DialogTitle className="sr-only">
            {isCapture ? t('quickCapture') : t('searchTasks')}
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
