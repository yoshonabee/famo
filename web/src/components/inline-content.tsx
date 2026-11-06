import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, request, type Task } from '@/lib/api'

export function InlineContent({
  task,
  field,
  busy,
}: {
  task: Task
  field: 'title' | 'description'
  busy: boolean
}) {
  const client = useQueryClient()
  const [edit, setEdit] = useState<{
    version: number
    original: string
    value: string
  } | null>(null)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const cancelling = useRef(false)
  const composing = useRef(false)
  const save = useMutation({
    mutationFn: (snapshot: NonNullable<typeof edit>) =>
      request<Task>(`/tasks/${task.id}/actions`, {
        op: field === 'title' ? 'rename' : 'update',
        [field]: snapshot.value,
        version: snapshot.version,
        source: 'ui',
      }),
    onSuccess: (updated) => {
      client.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t)),
      )
      void client.invalidateQueries({ queryKey: ['tasks'] })
      setEdit(null)
      setError('')
    },
    onError: (e) => {
      setError(e.message)
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  function cancel() {
    cancelling.current = true
    setEdit(null)
    setError('')
  }
  async function commit() {
    if (!edit || submitting.current || cancelling.current) return
    if (field === 'title' && !edit.value.trim()) {
      setError('標題不可空白')
      return
    }
    if (edit.original === edit.value) {
      cancel()
      return
    }
    if (edit.version !== task.version) {
      setError('任務已更新，請先確認最新內容。草稿仍保留。')
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
  const label = field === 'title' ? '任務標題' : '備註'
  if (!edit)
    return (
      <button
        type="button"
        className={`inline-content ${field === 'description' && !task[field] ? 'muted' : ''}`}
        aria-label={`編輯${label}`}
        disabled={busy}
        onClick={() => {
          cancelling.current = false
          setEdit({
            version: task.version,
            original: task[field],
            value: task[field],
          })
          setError('')
        }}
      >
        {task[field] || '新增備註…'}
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
          {error || '任務已更新，草稿仍保留。'}
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={cancel}
          >
            取消並讀取最新內容
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
          {save.isPending ? '儲存中…' : '儲存'}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          disabled={save.isPending}
          onClick={cancel}
        >
          取消
        </button>
      </span>
    </span>
  )
}
