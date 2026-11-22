import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, request, type Task } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'
import { formatTaskDate } from '@/lib/calendar'

export function TaskDate({ task, busy }: { task: Task; busy: boolean }) {
  const { t, locale, errorText } = useLanguage()
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
  const dateLabel = value ? formatTaskDate(value, locale) : t('undated')

  return (
    <div className="scheduled-date-field">
      <span className="task-date-label">{t('taskDate')}</span>
      <DatePicker
        date={value}
        onChange={change}
        label={t('taskDateValue', dateLabel)}
        align="start"
        buttonClassName="task-date-button"
        disabled={disabled}
        invalid={save.isError || conflict}
      >
        <CalendarDays size={16} />
        {dateLabel}
      </DatePicker>
      {value && (
        <button
          type="button"
          className="date-clear"
          disabled={disabled}
          onClick={() => change('')}
        >
          {t('clearDate')}
        </button>
      )}
      {save.isPending && (
        <span className="muted" role="status">
          {t('saving')}
        </span>
      )}
      {(save.isError || conflict) && (
        <span className="inline-edit-error" role="alert">
          {conflict ? t('dateConflict') : errorText(save.error)}
          {!conflict && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (draft) save.mutate(draft)
              }}
            >
              {t('retry')}
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
            {t('loadLatestDate')}
          </button>
        </span>
      )}
    </div>
  )
}
