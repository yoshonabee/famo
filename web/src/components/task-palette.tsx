import { useEffect, useRef } from 'react'
import { CalendarDays, ChevronDown, Search } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { ProjectBadge } from '@/components/project-appearance'
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

export function TaskSearch({
  value,
  onChange,
  onDone,
}: {
  value: string
  onChange: (value: string) => void
  onDone?: () => void
}) {
  return (
    <label className="search">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label="搜尋任務"
        placeholder="搜尋"
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
  captureProject,
  onCaptureDateChange,
  search,
  onSearchChange,
}: {
  mode: 'capture' | 'search' | null
  onClose: () => void
  capture: ReturnType<typeof useQuickCapture>
  captureDate: string
  captureProject?: Project
  onCaptureDateChange: (date: string) => void
  search: string
  onSearchChange: (value: string) => void
}) {
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
              event.target.closest('.calendar-popover')
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
            {isCapture ? '快速新增任務' : '搜尋任務'}
          </DialogTitle>
          {isCapture ? (
            <>
              <CaptureEntry
                onSubmit={(title) =>
                  capture.submit(title, { scheduledDate: captureDate })
                }
              />
              <DialogDescription className="sr-only">
                選擇任務日期，按 Enter 新增。
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
                  label={`任務日期 ${captureDate}`}
                  buttonClassName="task-palette-date-button"
                  align="start"
                >
                  <CalendarDays size={14} />
                  {captureDate}
                  <ChevronDown size={12} />
                </DatePicker>
                {captureProject && <ProjectBadge project={captureProject} />}
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
                搜尋目前清單，按 Enter 返回
              </DialogDescription>
            </>
          )}
          {isCapture && drafts.length > 0 && (
            <ul className="task-palette-drafts" aria-label="快速新增草稿">
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
