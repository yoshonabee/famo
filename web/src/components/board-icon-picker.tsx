import { useId, useLayoutEffect, useRef, useState } from 'react'
import { boardIcons } from '@/components/board-icons'
import { useLanguage } from '@/lib/i18n'
import { usePopupPosition } from '@/lib/popup-position'

const columns = 6

export function BoardIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const popupId = useId()
  const selected =
    boardIcons.find((icon) => icon.value === value) ?? boardIcons[0]
  const CurrentIcon = selected.Icon
  const label = t('boardIconValue', t(selected.label))

  usePopupPosition(popup, open ? trigger.current : null, 'start')

  useLayoutEffect(() => {
    if (!open) return
    popup.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true })

    function dismiss(event: Event) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('focusin', dismiss)
    }
  }, [open])

  function close() {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  return (
    <div className="board-icon-picker" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="board-icon-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          setOpen(true)
        }}
      >
        <CurrentIcon size={20} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popup}
          id={popupId}
          className="board-icon-popup"
          role="listbox"
          aria-label={t('boardIcon')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            } else if (event.key === 'Tab') {
              close()
            } else if (
              [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'Home',
                'End',
              ].includes(event.key)
            ) {
              event.preventDefault()
              const options = Array.from(
                event.currentTarget.querySelectorAll('button'),
              )
              const index = options.findIndex(
                (option) => option === event.target,
              )
              const count = options.length
              const next = {
                ArrowLeft: (index + count - 1) % count,
                ArrowRight: (index + 1) % count,
                ArrowUp: (index + count - columns) % count,
                ArrowDown: (index + columns) % count,
                Home: 0,
                End: count - 1,
              }[event.key]
              if (next !== undefined) options[next]?.focus()
            }
          }}
        >
          {boardIcons.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-label={t(label)}
              aria-selected={value === selected.value}
              title={t(label)}
              tabIndex={-1}
              onClick={() => {
                close()
                if (value !== selected.value) onChange(value)
              }}
            >
              <Icon size={19} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
