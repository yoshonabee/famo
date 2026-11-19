import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import { adjacentDate } from '@/lib/calendar'

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
