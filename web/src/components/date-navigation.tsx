import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { adjacentDate, localDate } from '@/lib/calendar'

export function DateNavigation({
  date,
  onChange,
}: {
  date: string
  onChange: (date: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [offset, setOffset] = useState(0)
  const [month, setMonth] = useState(date.slice(0, 7))
  const [focused, setFocused] = useState(date)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popupId = useId()
  const today = localDate()
  const first = new Date(`${month}-01T12:00:00`)
  const days = new Date(first)
  days.setMonth(days.getMonth() + 1, 0)
  const previousMonth = adjacentDate(`${month}-01`, -1).slice(0, 7)
  const nextMonth = adjacentDate(localDate(days), 1).slice(0, 7)

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }
  function select(value: string) {
    onChange(value)
    close()
  }
  useLayoutEffect(() => {
    if (!open) return
    function align() {
      const right = root.current?.getBoundingClientRect().right ?? 300
      setOffset(Math.max(0, Math.min(288, window.innerWidth - 24) + 12 - right))
    }
    align()
    window.addEventListener('resize', align)
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('resize', align)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
        ?.focus({ preventScroll: true })
  }, [open, focused, month])

  return (
    <div className="date-navigation" role="group" aria-label="日期導覽">
      <Button
        variant="ghost"
        size="icon"
        aria-label="前一天"
        disabled={date === '0001-01-01'}
        onClick={() => {
          setOpen(false)
          onChange(adjacentDate(date, -1))
        }}
      >
        <ChevronLeft />
      </Button>
      <div
        className="today-picker"
        ref={root}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setOpen(false)
        }}
      >
        <div className="today-picker-button">
          <button
            type="button"
            className="today-shortcut"
            onClick={() => {
              setOpen(false)
              onChange(localDate())
            }}
          >
            今日
          </button>
          <button
            type="button"
            className="today-picker-trigger"
            ref={trigger}
            aria-label="開啟日期選單"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? popupId : undefined}
            onClick={() => {
              if (open) close()
              else {
                setMonth(date.slice(0, 7))
                setFocused(date)
                setOpen(true)
              }
            }}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        {open && (
          <div
            className="calendar-popover"
            style={{ right: -offset }}
            id={popupId}
            role="dialog"
            aria-label="選擇日期"
          >
            <div className="calendar-month">
              <Button
                variant="ghost"
                size="icon"
                aria-label="上一個月"
                disabled={month === '0001-01'}
                onClick={() => setMonth(previousMonth)}
              >
                <ChevronLeft />
              </Button>
              <span aria-live="polite">
                {first.getFullYear()}年 {first.getMonth() + 1}月
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="下一個月"
                disabled={month === '9999-12'}
                onClick={() => setMonth(nextMonth)}
              >
                <ChevronRight />
              </Button>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-days" role="group" aria-label="日期">
              {Array.from({ length: first.getDay() }, (_, index) => (
                <span key={`blank-${index}`} />
              ))}
              {Array.from({ length: days.getDate() }, (_, index) => {
                const value = `${month}-${String(index + 1).padStart(2, '0')}`
                return (
                  <button
                    type="button"
                    key={value}
                    data-date={value}
                    aria-label={value}
                    aria-pressed={value === date}
                    aria-current={value === today ? 'date' : undefined}
                    tabIndex={
                      value === focused ||
                      (!focused.startsWith(month) && index === 0)
                        ? 0
                        : -1
                    }
                    onClick={() => select(value)}
                    onKeyDown={(event) => {
                      const offset = {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                      }[event.key]
                      if (offset === undefined) return
                      event.preventDefault()
                      const next = adjacentDate(value, offset)
                      if (
                        next.length !== 10 ||
                        next < '0001-01-01' ||
                        next > '9999-12-31'
                      )
                        return
                      setFocused(next)
                      setMonth(next.slice(0, 7))
                    }}
                  >
                    {index + 1}
                  </button>
                )
              })}
            </div>
            <label className="calendar-jump">
              跳至日期
              <input
                type="date"
                aria-label="選擇日期"
                min="0001-01-01"
                max="9999-12-31"
                value={date}
                onChange={(event) => {
                  if (event.target.value && event.target.validity.valid)
                    select(event.target.value)
                }}
              />
            </label>
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="後一天"
        disabled={date === '9999-12-31'}
        onClick={() => {
          setOpen(false)
          onChange(adjacentDate(date, 1))
        }}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
