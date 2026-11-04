import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, request, type Action, type Task } from '@/lib/api'

type Edit = { task: Task; title: string }

export function TodoTitle({
  task,
  title,
  onDeleted,
}: {
  task: Task
  title: string
  onDeleted: () => void
}) {
  const client = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const edit = useRef<Edit | null>(null)
  const composing = useRef(false)
  const submitting = useRef(false)
  const cancelling = useRef(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const action = useMutation({
    mutationFn: ({
      snapshot,
      op,
      title: updatedTitle,
    }: {
      snapshot: Edit
      op: Action['op']
      title: string
    }) =>
      request<Task>(`/tasks/${snapshot.task.id}/actions`, {
        op,
        version: snapshot.task.version,
        source: 'ui',
        ...(op === 'rename' ? { title: updatedTitle } : {}),
      }),
    onSuccess: (updated) => {
      client.setQueryData<Task[]>(['tasks'], (old) =>
        old?.flatMap((t) =>
          t.id === updated.id ? (updated.deleted_at ? [] : [updated]) : [t],
        ),
      )
      void client.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: (e) => {
      setError(e.message)
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  function begin() {
    if (edit.current) return
    edit.current = { task, title }
    setDraft(title)
    setError('')
    cancelling.current = false
  }
  function cancel() {
    cancelling.current = true
    edit.current = null
    setDraft(null)
    setError('')
  }
  async function commit(op: 'rename' | 'delete_item' = 'rename') {
    const snapshot = edit.current
    if (!snapshot || submitting.current || cancelling.current) return
    const value = input.current?.value ?? ''
    if (op === 'rename' && (!value.trim() || value.trim() === snapshot.title)) {
      cancel()
      return
    }
    submitting.current = true
    const row = input.current?.closest('.task-row')
    const sibling = row?.previousElementSibling ?? row?.nextElementSibling
    const nextFocus =
      sibling?.querySelector<HTMLInputElement>('input.todo-title')
    try {
      await action.mutateAsync({ snapshot, op, title: value.trim() })
      cancel()
      input.current?.blur()
      if (op === 'delete_item') {
        onDeleted()
        requestAnimationFrame(() => {
          const target = nextFocus?.isConnected
            ? nextFocus
            : document.querySelector<HTMLInputElement>(
                '[aria-label="快速新增任務名稱"]',
              )
          target?.focus()
        })
      }
    } catch {
      // Keep the draft and the version it was based on for an explicit retry.
    } finally {
      submitting.current = false
    }
  }
  return (
    <div className="todo-title-editor">
      <input
        ref={input}
        className="todo-title"
        aria-label={`編輯任務標題：${title}`}
        value={draft ?? title}
        maxLength={200}
        readOnly={action.isPending}
        onFocus={begin}
        onChange={(e) => {
          begin()
          setDraft(e.target.value)
        }}
        onBlur={() => {
          void commit()
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onKeyDown={(e) => {
          if (
            composing.current ||
            e.nativeEvent.isComposing ||
            e.keyCode === 229
          )
            return
          if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
            input.current?.blur()
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
            input.current?.blur()
          }
          if (
            e.key === 'Backspace' &&
            e.currentTarget.value === '' &&
            !e.repeat
          ) {
            e.preventDefault()
            void commit('delete_item')
          }
        }}
      />
      {error && (
        <div className="inline-edit-error" role="alert">
          {error}
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              cancel()
              input.current?.blur()
            }}
          >
            取消並讀取最新標題
          </button>
        </div>
      )}
    </div>
  )
}
