import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, request, type Task } from '@/lib/api'
import { LocalizedError, useLanguage } from '@/lib/i18n'

export function InlineContent({
  task,
  field,
  busy,
}: {
  task: Task
  field: 'title' | 'description'
  busy: boolean
}) {
  const { t, errorText } = useLanguage()
  const client = useQueryClient()
  const [edit, setEdit] = useState<{
    version: number
    original: string
    value: string
  } | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const submitting = useRef(false)
  const cancelling = useRef(false)
  const composing = useRef(false)
  const save = useMutation({
    mutationFn: (snapshot: NonNullable<typeof edit>) =>
      request<Task>(`/tasks/${task.id}/actions`, {
        op: field === 'title' ? 'rename' : 'update',
        [field]: snapshot.value,
        version: snapshot.version,
      }),
    onSuccess: (updated) => {
      client.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t)),
      )
      void client.invalidateQueries({ queryKey: ['tasks'] })
      setEdit(null)
      setError(null)
    },
    onError: (e) => {
      setError(e)
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  function cancel() {
    cancelling.current = true
    setEdit(null)
    setError(null)
  }
  async function commit() {
    if (!edit || submitting.current || cancelling.current) return
    if (field === 'title' && !edit.value.trim()) {
      setError(new LocalizedError((translate) => translate('blankTaskTitle')))
      return
    }
    if (edit.original === edit.value) {
      cancel()
      return
    }
    if (edit.version !== task.version) {
      setError(new LocalizedError((translate) => translate('inlineConflict')))
      return
    }
    submitting.current = true
    try {
      await save.mutateAsync(edit)
    } catch {
      /* Preserve the draft for retry. */
    } finally {
      submitting.current = false
    }
  }
  const label = field === 'title' ? t('taskTitle') : t('notes')
  if (!edit)
    return (
      <button
        type="button"
        className={`inline-content ${field === 'description' && !task[field] ? 'muted' : ''}`}
        aria-label={t('editField', label)}
        disabled={busy}
        onClick={() => {
          cancelling.current = false
          setEdit({
            version: task.version,
            original: task[field],
            value: task[field],
          })
          setError(null)
        }}
      >
        {task[field] || t('addNotes')}
      </button>
    )
  const props = {
    autoFocus: true,
    'aria-label': label,
    value: edit.value,
    readOnly: save.isPending,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setEdit({ ...edit, value: e.target.value }),
    onBlur: () => {
      void commit()
    },
    onCompositionStart: () => {
      composing.current = true
    },
    onCompositionEnd: () => {
      composing.current = false
    },
    onKeyDown: (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229)
        return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel()
      }
      if (e.key === 'Enter' && (field === 'title' || e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void commit()
      }
    },
  }
  return (
    <span className="inline-content-editor">
      {field === 'title' ? (
        <input {...props} maxLength={200} />
      ) : (
        <textarea {...props} rows={6} />
      )}
      {(error || edit.version !== task.version) && (
        <span role="alert" className="inline-edit-error">
          {error ? errorText(error) : t('draftConflict')}
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={cancel}
          >
            {t('discardDraftAndReload')}
          </button>
        </span>
      )}
      <span className="inline-edit-actions">
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          disabled={save.isPending || edit.version !== task.version}
          onClick={() => void commit()}
        >
          {save.isPending ? t('saving') : t('save')}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          disabled={save.isPending}
          onClick={cancel}
        >
          {t('cancel')}
        </button>
      </span>
    </span>
  )
}
