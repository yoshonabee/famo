import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import { adjacentDate } from '@/lib/calendar'
import { useLanguage } from '@/lib/i18n'

export function CalendarDate({ date }: { date: string }) {
  const { locale } = useLanguage()
  const day = new Date(`${date}T12:00:00`)
  return (
    <>
      <time dateTime={date}>
        {day.toLocaleDateString(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </time>
      <span className="date-weekday">
        {day.toLocaleDateString(locale, { weekday: 'long' })}
      </span>
    </>
  )
}

export function DateNavigation({
  date,
  onChange,
}: {
  date: string
  onChange: (date: string) => void
}) {
  const { t } = useLanguage()
  return (
    <div
      className="date-navigation"
      role="group"
      aria-label={t('dateNavigation')}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('previousDay')}
        disabled={date === '0001-01-01'}
        onClick={() => onChange(adjacentDate(date, -1))}
      >
        <ChevronLeft />
      </Button>
      <DatePicker
        date={date}
        onChange={onChange}
        label={t('openCalendar')}
        buttonClassName="today-picker-trigger"
        showToday
      >
        <ChevronDown size={15} />
      </DatePicker>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('nextDay')}
        disabled={date === '9999-12-31'}
        onClick={() => onChange(adjacentDate(date, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
