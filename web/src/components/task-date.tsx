import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, request, type Task } from '@/lib/api'

export function TaskDate({ task, busy }: { task: Task; busy: boolean }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState<{ value: string; version: number } | null>(
    null,
  )
  const save = useMutation({
    mutationFn: (snapshot: NonNullable<typeof draft>) =>
      request<Task>(`/tasks/${task.id}/actions`, {
        op: 'update',
        scheduled_date: snapshot.value,
        version: snapshot.version,
      }),
    onSuccess: (updated) => {
      client.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((item) => (item.id === updated.id ? updated : item)),
      )
      void client.invalidateQueries({ queryKey: ['tasks'] })
      setDraft(null)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const value = draft?.value ?? task.scheduled_date
  const disabled = busy || save.isPending
  function change(value: string) {
    if (disabled) return
    const snapshot = { value, version: draft?.version ?? task.version }
    setDraft(snapshot)
    if (snapshot.version === task.version) save.mutate(snapshot)
  }
  const conflict = !!draft && draft.version !== task.version
  return (
    <div className="scheduled-date-field">
      <span className="task-date-label">任務日期</span>
      <DatePicker
        date={value}
        onChange={change}
        label={`任務日期：${value || '未指定日期'}`}
        align="start"
        buttonClassName="task-date-button"
        disabled={disabled}
        invalid={save.isError || conflict}
      >
        <CalendarDays size={16} />
        {value || '未指定日期'}
      </DatePicker>
      {value && (
        <button
          type="button"
          className="date-clear"
          disabled={disabled}
          onClick={() => change('')}
        >
          清除日期
        </button>
      )}
      {save.isPending && (
        <span className="muted" role="status">
          儲存中…
        </span>
      )}
      {(save.isError || conflict) && (
        <span className="inline-edit-error" role="alert">
          {conflict
            ? '任務已更新，日期選擇已保留。請讀取最新日期後重新選擇。'
            : save.error?.message}
          {!conflict && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (draft) save.mutate(draft)
              }}
            >
              重試
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setDraft(null)
              save.reset()
              void client.invalidateQueries({ queryKey: ['tasks'] })
            }}
          >
            讀取最新日期
          </button>
        </span>
      )}
    </div>
  )
}
