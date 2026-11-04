import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CornerDownLeft, LoaderCircle, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { request, type Task } from '@/lib/api'

type Draft = { id: string; title: string; error?: string }

function taskTitle(value: string) {
  return value
    .trim()
    .replace(/^(?:[-*+]\s+(?:\[\s\]\s*)?|\[\s\]\s*)/, '')
    .trim()
}

export function useQuickCapture(onCapture: () => void) {
  const client = useQueryClient()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [announcement, setAnnouncement] = useState('')
  const create = useMutation({
    mutationFn: (title: string) =>
      request<Task>('/tasks', {
        title,
        source: 'ui',
      }),
    retry: false,
    onSuccess: async (task) => {
      await client.cancelQueries({ queryKey: ['tasks'] })
      client.setQueryData<Task[]>(['tasks'], (old = []) => [
        ...old.filter((item) => item.id !== task.id),
        task,
      ])
      void client.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  async function save(draft: Draft) {
    setDrafts((old) =>
      old.map((item) =>
        item.id === draft.id ? { ...item, error: undefined } : item,
      ),
    )
    try {
      const task = await create.mutateAsync(draft.title)
      setDrafts((old) => old.filter((item) => item.id !== draft.id))
      setAnnouncement(`已新增：${task.title}`)
    } catch (error) {
      setDrafts((old) =>
        old.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                error:
                  error instanceof Error ? error.message : '無法儲存，請重試',
              }
            : item,
        ),
      )
    }
  }
  function submit(title: string) {
    const draft = { id: crypto.randomUUID(), title }
    setDrafts((old) => [...old, draft])
    onCapture()
    void save(draft)
  }
  return { drafts, submit, retry: save, announcement }
}

export function CaptureDraftRow({
  draft,
  retry,
}: {
  draft: Draft
  retry: (draft: Draft) => void
}) {
  return (
    <li className="task-row draft-row">
      <div className="todo-line">
        <Checkbox
          checked={false}
          disabled
          aria-label={`正在新增任務：${draft.title}`}
        />
        <span className="todo-title">{draft.title}</span>
        {draft.error ? (
          <Button variant="ghost" size="sm" onClick={() => retry(draft)}>
            重試
          </Button>
        ) : (
          <span className="task-chip saving">
            <LoaderCircle size={12} className="animate-spin" />
            儲存中
          </span>
        )}
      </div>
      {draft.error && (
        <p className="capture-error" role="alert">
          未能確認儲存：{draft.error}。內容已保留，請確認任務列表後重試。
        </p>
      )}
    </li>
  )
}

export function QuickCapture({
  hidden,
  focusRequest,
  onSubmit,
  announcement,
}: {
  hidden: boolean
  focusRequest: number
  onSubmit: (title: string) => void
  announcement: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const [draft, setDraft] = useState('')
  useEffect(() => {
    if (focusRequest > 0) input.current?.focus()
  }, [focusRequest])
  function submit() {
    if (composing.current) return
    const title = taskTitle(draft)
    if (!title) return
    setDraft('')
    onSubmit(title)
    input.current?.focus({ preventScroll: true })
  }
  return (
    <section
      className="quick-capture"
      aria-label="快速新增任務"
      hidden={hidden}
    >
      <div className="capture-entry">
        <Square className="capture-marker" size={17} aria-hidden="true" />
        <input
          ref={input}
          aria-label="快速新增任務名稱"
          value={draft}
          maxLength={200}
          placeholder="新增任務…"
          onChange={(e) => setDraft(e.target.value)}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onKeyDown={(e) => {
            if (
              e.key !== 'Enter' ||
              composing.current ||
              e.nativeEvent.isComposing ||
              e.keyCode === 229
            )
              return
            e.preventDefault()
            submit()
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="新增這一列"
          title="Enter 新增"
          disabled={!taskTitle(draft)}
          onClick={submit}
        >
          <CornerDownLeft />
        </Button>
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </section>
  )
}
