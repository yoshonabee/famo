import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Folder } from 'lucide-react'
import { ProjectColorDot } from '@/components/project-appearance'
import type { Project } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'
import { usePopupPosition } from '@/lib/popup-position'

export function ProjectPicker({
  projects,
  value,
  onChange,
  label,
  allowUnassigned = true,
  buttonClassName = 'task-date-button',
  disabled,
}: {
  projects: Project[]
  value: string | undefined
  onChange: (projectId: string) => void
  label: string
  allowUnassigned?: boolean
  buttonClassName?: string
  disabled?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const popupId = useId()
  const valueId = useId()
  const choices = allowUnassigned
    ? [{ id: '', name: t('unassigned'), color: '' }, ...projects]
    : projects
  const selected = choices.find((project) => project.id === value)
  const name = selected?.name ?? t('chooseProject')
  const inactive = disabled || choices.length === 0
  const expanded = open && !inactive

  usePopupPosition(popup, expanded ? trigger.current : null, 'start')

  useLayoutEffect(() => {
    if (!expanded) return
    const item =
      popup.current?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      popup.current?.querySelector<HTMLElement>('[role="option"]')
    item?.focus({ preventScroll: true })
    item?.scrollIntoView({ block: 'nearest' })

    function dismiss(event: Event) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('focusin', dismiss)
    }
  }, [expanded])

  function close() {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  return (
    <div className="project-picker" ref={root}>
      <button
        className={`project-picker-trigger ${buttonClassName}`}
        ref={trigger}
        type="button"
        aria-label={label}
        aria-describedby={valueId}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? popupId : undefined}
        disabled={inactive}
        onClick={() => (expanded ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        {selected?.color ? (
          <ProjectColorDot color={selected.color} />
        ) : (
          <Folder size={14} aria-hidden="true" />
        )}
        <span id={valueId} title={name}>
          {name}
        </span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {expanded && (
        <div
          className="project-picker-popup"
          id={popupId}
          ref={popup}
          role="listbox"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            } else if (event.key === 'Tab') {
              close()
            } else if (
              ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
            ) {
              event.preventDefault()
              const options = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="option"]',
                ),
              )
              const index = options.findIndex((item) => item === event.target)
              const next = {
                ArrowDown: (index + 1) % options.length,
                ArrowUp: (index + options.length - 1) % options.length,
                Home: 0,
                End: options.length - 1,
              }[event.key]
              if (next !== undefined) options[next]?.focus()
            }
          }}
        >
          {choices.map((project) => (
            <button
              key={project.id}
              type="button"
              role="option"
              aria-selected={selected?.id === project.id}
              tabIndex={-1}
              onClick={() => {
                close()
                if (project.id !== selected?.id) onChange(project.id)
              }}
            >
              {project.color ? (
                <ProjectColorDot color={project.color} />
              ) : (
                <Folder size={12} aria-hidden="true" />
              )}
              <span>{project.name}</span>
              {selected?.id === project.id && (
                <Check size={14} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
