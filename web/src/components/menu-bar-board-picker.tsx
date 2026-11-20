import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Board } from '@/lib/api'

export function MenuBarBoardPicker({
  boards,
  board,
  onChange,
}: {
  boards: Board[]
  board?: Board
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const selectedId = board?.id ?? ''
  const name = board?.name ?? '今日'
  const choices = [{ id: '', name: '今日' }, ...boards]

  useLayoutEffect(() => {
    if (!open) return
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus()
    const dismiss = () => setOpen(false)
    function dismissOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) dismiss()
    }
    document.addEventListener('pointerdown', dismissOutside)
    window.addEventListener('blur', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      window.removeEventListener('blur', dismiss)
    }
  }, [open])

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div className="menu-bar-board-picker" ref={root}>
      <button
        type="button"
        className="menu-bar-board-trigger"
        ref={trigger}
        title={name}
        aria-label={`選擇 Board：${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="brand-mark" aria-hidden="true" />
        <span className="menu-bar-board-name">{name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="menu-bar-board-menu"
          id={menuId}
          ref={menu}
          role="menu"
          aria-label="Board"
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
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  'button',
                ),
              )
              const index = items.findIndex((item) => item === event.target)
              const next = {
                ArrowDown: (index + 1) % items.length,
                ArrowUp: (index + items.length - 1) % items.length,
                Home: 0,
                End: items.length - 1,
              }
              items[next[event.key as keyof typeof next]]?.focus()
            }
          }}
        >
          {choices.map(({ id, name }) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={selectedId === id}
              tabIndex={-1}
              onClick={() => {
                onChange(id)
                close()
              }}
            >
              <span>{name}</span>
              {selectedId === id && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
