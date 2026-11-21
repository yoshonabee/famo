import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { adjacentDate, formatTaskDate, localDate } from '@/lib/calendar'
import { useLanguage } from '@/lib/i18n'
import { usePopupPosition } from '@/lib/popup-position'

type Alignment = 'start' | 'end'
type View = 'days' | 'months' | 'years'
const yearsPerPage = 12

function Calendar({
  id,
  date,
  anchor,
  align,
  onSelect,
  onClear,
}: {
  id: string
  date: string
  anchor: HTMLButtonElement | null
  align: Alignment
  onSelect: (date: string) => void
  onClear?: () => void
}) {
  const { t, locale } = useLanguage()
  const today = localDate()
  const [focused, setFocused] = useState(date || today)
  const [month, setMonth] = useState(focused.slice(0, 7))
  const [view, setView] = useState<View>('days')
  const year = Number(month.slice(0, 4))
  const [firstYear, setFirstYear] = useState(year)
  const calendar = useRef<HTMLDivElement>(null)
  const first = new Date(`${month}-01T12:00:00`)
  const last = new Date(first)
  last.setMonth(last.getMonth() + 1, 0)
  const lastYear = Math.min(firstYear + yearsPerPage - 1, 9999)

  usePopupPosition(calendar, anchor, align)

  useLayoutEffect(() => {
    const selector =
      view === 'days' ? `[data-date="${focused}"]` : '[data-calendar-focus]'
    calendar.current
      ?.querySelector<HTMLButtonElement>(selector)
      ?.focus({ preventScroll: true })
  }, [view, focused])

  function navigate(direction: -1 | 1) {
    if (view === 'days') {
      setMonth(
        adjacentDate(
          direction < 0 ? localDate(first) : localDate(last),
          direction,
        ).slice(0, 7),
      )
    } else if (view === 'months') {
      setMonth(`${String(year + direction).padStart(4, '0')}-${month.slice(5)}`)
    } else {
      setFirstYear(firstYear + yearsPerPage * direction)
    }
  }

  const shortMonth = new Intl.DateTimeFormat(locale, { month: 'short' })
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: locale === 'en' ? 'short' : 'narrow',
  })
  const heading = {
    days:
      locale === 'zh-TW'
        ? t('calendarMonthHeading', year, first.getMonth() + 1)
        : first.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    months: t('calendarYear', year),
    years: t('yearRange', firstYear, lastYear),
  }[view]
  const [previousLabel, nextLabel] = {
    days: [t('previousMonth'), t('nextMonth')],
    months: [t('previousYear'), t('nextYear')],
    years: [t('previousYears'), t('nextYears')],
  }[view]

  return (
    <div
      className="calendar-popover"
      onMouseDown={(event) => {
        // WebKit can focus the enclosing task row before a button receives its click.
        const button =
          event.target instanceof Element && event.target.closest('button')
        if (event.button === 0 && button) {
          event.preventDefault()
          button.focus({ preventScroll: true })
        }
      }}
      ref={calendar}
      id={id}
      role="dialog"
      aria-label={t('chooseDate')}
    >
      <div className="calendar-month">
        <Button
          variant="ghost"
          size="icon"
          aria-label={previousLabel}
          disabled={
            view === 'days'
              ? month === '0001-01'
              : view === 'months'
                ? year === 1
                : firstYear === 1
          }
          onClick={() => navigate(-1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="calendar-view-button"
          onClick={() => {
            if (view === 'months')
              setFirstYear(
                Math.floor((year - 1) / yearsPerPage) * yearsPerPage + 1,
              )
            setView(view === 'months' ? 'years' : 'months')
          }}
        >
          {heading}
          <ChevronDown size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={nextLabel}
          disabled={
            view === 'days'
              ? month === '9999-12'
              : view === 'months'
                ? year === 9999
                : lastYear === 9999
          }
          onClick={() => navigate(1)}
        >
          <ChevronRight />
        </Button>
      </div>
      {view === 'days' && (
        <>
          <div className="calendar-weekdays" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index}>
                {weekday.format(new Date(1970, 0, 4 + index))}
              </span>
            ))}
          </div>
          <div className="calendar-days" role="group" aria-label={t('days')}>
            {Array.from({ length: first.getDay() }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: last.getDate() }, (_, index) => {
              const value = `${month}-${String(index + 1).padStart(2, '0')}`
              return (
                <button
                  type="button"
                  key={value}
                  data-date={value}
                  aria-label={formatTaskDate(value, locale)}
                  aria-pressed={value === date}
                  aria-current={value === today ? 'date' : undefined}
                  tabIndex={
                    value === focused ||
                    (!focused.startsWith(month) && index === 0)
                      ? 0
                      : -1
                  }
                  onClick={() => onSelect(value)}
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
        </>
      )}
      {view === 'months' && (
        <div className="calendar-periods" role="group" aria-label={t('months')}>
          {Array.from({ length: 12 }, (_, index) => {
            const value = `${month.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`
            return (
              <button
                type="button"
                key={value}
                data-calendar-focus={value === month ? '' : undefined}
                aria-pressed={value === month}
                onClick={() => {
                  setMonth(value)
                  setFocused(value === date.slice(0, 7) ? date : `${value}-01`)
                  setView('days')
                }}
              >
                {locale === 'zh-TW'
                  ? t('calendarMonth', index + 1)
                  : shortMonth.format(new Date(year, index, 1))}
              </button>
            )
          })}
        </div>
      )}
      {view === 'years' && (
        <div className="calendar-periods" role="group" aria-label={t('years')}>
          {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
            const value = firstYear + index
            return (
              <button
                type="button"
                key={value}
                data-calendar-focus={value === year ? '' : undefined}
                aria-pressed={value === year}
                onClick={() => {
                  setMonth(
                    `${String(value).padStart(4, '0')}-${month.slice(5)}`,
                  )
                  setView('months')
                }}
              >
                {t('calendarYear', value)}
              </button>
            )
          })}
        </div>
      )}
      {onClear && (
        <div className="calendar-actions">
          <Button variant="ghost" size="sm" onClick={onClear}>
            {t('clearDate')}
          </Button>
        </div>
      )}
    </div>
  )
}

export function DatePicker({
  date,
  onChange,
  label,
  buttonClassName,
  align = 'end',
  disabled,
  invalid,
  title,
  clearable,
  showToday,
  children,
}: {
  date: string
  onChange: (date: string) => void
  label: string
  buttonClassName?: string
  align?: Alignment
  disabled?: boolean
  invalid?: boolean
  title?: string
  clearable?: boolean
  showToday?: boolean
  children: ReactNode
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popupId = useId()

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  function select(value: string) {
    close()
    if (value !== date) onChange(value)
  }

  useLayoutEffect(() => {
    if (!open) return
    function outside(event: Event) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
    }
  }, [open])

  return (
    <div
      className="date-picker"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
    >
      <div className={showToday ? 'today-picker-button' : undefined}>
        {showToday && (
          <button
            type="button"
            className="today-shortcut"
            onClick={() => {
              setOpen(false)
              onChange(localDate())
            }}
          >
            {t('today')}
          </button>
        )}
        <button
          type="button"
          className={buttonClassName}
          ref={trigger}
          title={title}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open && !disabled}
          aria-controls={open && !disabled ? popupId : undefined}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          {children}
        </button>
      </div>
      {open && !disabled && (
        <Calendar
          id={popupId}
          date={date}
          anchor={trigger.current}
          align={align}
          onSelect={select}
          onClear={clearable && date ? () => select('') : undefined}
        />
      )}
    </div>
  )
}
