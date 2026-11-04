import { useState } from 'react'
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
        source: 'ui',
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
      <label>
        任務日期
        <input
          type="date"
          aria-label="任務日期"
          value={value}
          min="0001-01-01"
          max="9999-12-31"
          disabled={disabled}
          aria-invalid={save.isError || conflict}
          onChange={(event) => {
            if (event.currentTarget.validity.valid) change(event.target.value)
          }}
        />
      </label>
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
