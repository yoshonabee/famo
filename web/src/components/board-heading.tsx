import { BoardIconPicker } from '@/components/board-icon-picker'
import { CalendarDate } from '@/components/date-navigation'
import type { Board } from '@/lib/api'
import { useSaveBoard } from '@/lib/board-mutations'
import { useLanguage } from '@/lib/i18n'

export function BoardHeading({ board, date }: { board: Board; date: string }) {
  const { errorText } = useLanguage()
  const save = useSaveBoard(board)

  return (
    <div className="board-heading">
      <BoardIconPicker
        value={board.icon}
        disabled={save.isPending}
        onChange={(icon) =>
          save.mutate({
            name: board.name,
            project_ids: board.project_ids,
            icon,
          })
        }
      />
      <h1>{board.name}</h1>
      <p className="board-date">
        <CalendarDate date={date} />
      </p>
      {save.isError && (
        <p className="inline-edit-error" role="alert">
          {errorText(save.error)}
        </p>
      )}
    </div>
  )
}
