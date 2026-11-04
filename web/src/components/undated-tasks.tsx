import { useState, type ReactNode } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { localDate } from '@/lib/calendar'
import { type Task } from '@/lib/api'

export function UndatedTasks({
  tasks,
  busy,
  onAssign,
  renderTask,
}: {
  tasks: Task[]
  busy: boolean
  onAssign: (task: Task, date: string) => Promise<void>
  renderTask: (task: Task, index: number, disabled: boolean) => ReactNode
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const disabled = busy || assigning
  const chosen = tasks.filter((task) => selected.includes(task.id))
  async function assignToday() {
    setAssigning(true)
    const today = localDate()
    try {
      for (const task of chosen) {
        try {
          await onAssign(task, today)
          setSelected((ids) => ids.filter((id) => id !== task.id))
        } catch {
          // The shared mutation shows errors; failed tasks remain selected for retry.
        }
      }
    } finally {
      setAssigning(false)
    }
  }
  return (
    <details className="undated-tasks">
      <summary>未指定日期（{tasks.length}）</summary>
      {tasks.length ? (
        <>
          <div className="undated-actions">
            <label>
              <Checkbox
                aria-label="全選未指定日期任務"
                disabled={disabled}
                checked={
                  chosen.length === tasks.length
                    ? true
                    : chosen.length
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(checked) =>
                  setSelected((ids) =>
                    checked
                      ? [...new Set([...ids, ...tasks.map((task) => task.id)])]
                      : ids.filter(
                          (id) => !tasks.some((task) => task.id === id),
                        ),
                  )
                }
              />
              全選
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || !chosen.length}
              onClick={() => void assignToday()}
            >
              {assigning ? '安排中…' : `安排到今日（${chosen.length}）`}
            </Button>
          </div>
          <DragDropProvider>
            <ul className="task-list" aria-label="未指定日期任務">
              {tasks.map((task, index) => (
                <li className="undated-task" key={task.id}>
                  <Checkbox
                    aria-label={`選取未指定日期任務：${task.title}`}
                    checked={selected.includes(task.id)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      setSelected((ids) =>
                        checked
                          ? [...new Set([...ids, task.id])]
                          : ids.filter((id) => id !== task.id),
                      )
                    }
                  />
                  <ul>{renderTask(task, index, true)}</ul>
                </li>
              ))}
            </ul>
          </DragDropProvider>
        </>
      ) : (
        <p className="empty-list">沒有未指定日期的任務</p>
      )}
    </details>
  )
}
