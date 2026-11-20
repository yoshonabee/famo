import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import { adjacentDate } from '@/lib/calendar'

export function CalendarDate({ date }: { date: string }) {
  const day = new Date(`${date}T12:00:00`)
  return (
    <>
      <time dateTime={date}>
        {day.toLocaleDateString('zh-TW', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </time>
      <span className="date-weekday">
        {day.toLocaleDateString('zh-TW', { weekday: 'long' })}
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
  return (
    <div className="date-navigation" role="group" aria-label="日期導覽">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="前一天"
        disabled={date === '0001-01-01'}
        onClick={() => onChange(adjacentDate(date, -1))}
      >
        <ChevronLeft />
      </Button>
      <DatePicker
        date={date}
        onChange={onChange}
        label="開啟日期選單"
        buttonClassName="today-picker-trigger"
        showToday
      >
        <ChevronDown size={15} />
      </DatePicker>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="後一天"
        disabled={date === '9999-12-31'}
        onClick={() => onChange(adjacentDate(date, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
