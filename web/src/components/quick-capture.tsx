import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CornerDownLeft, LoaderCircle, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { request, type Task } from '@/lib/api'
import { useLanguage } from '@/lib/i18n'

type Draft = {
  id: string
  title: string
  scheduled_date: string
  project_id?: string
  floating?: boolean
  error?: string
}

function taskTitle(value: string) {
  return value
    .trim()
    .replace(/^(?:[-*+]\s+(?:\[\s\]\s*)?|\[\s\]\s*)/, '')
    .trim()
}

export function useQuickCapture(
  onCapture: () => void,
  scheduledDate = '',
  projectId?: string,
) {
  const { t } = useLanguage()
  const client = useQueryClient()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [announcement, setAnnouncement] = useState('')
  const create = useMutation({
    mutationFn: (draft: Draft) =>
      request<Task>('/tasks', {
        title: draft.title,
        scheduled_date: draft.scheduled_date,
        project_id: draft.project_id,
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
      const task = await create.mutateAsync(draft)
      setDrafts((old) => old.filter((item) => item.id !== draft.id))
      setAnnouncement(t('taskAdded', task.title))
    } catch (error) {
      setDrafts((old) =>
        old.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                error: error instanceof Error ? error.message : t('saveFailed'),
              }
            : item,
        ),
      )
    }
  }
  function submit(
    title: string,
    fromPalette?: { scheduledDate: string; projectId: string },
  ) {
    const draft = {
      id: crypto.randomUUID(),
      title,
      scheduled_date: fromPalette?.scheduledDate ?? scheduledDate,
      project_id: fromPalette ? fromPalette.projectId || undefined : projectId,
      floating: !!fromPalette,
    }
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
  const { t, errorText } = useLanguage()
  return (
    <li className="task-row draft-row">
      <div className="todo-line">
        <Checkbox
          checked={false}
          disabled
          aria-label={t('addingNamedTask', draft.title)}
        />
        <span className="todo-title">{draft.title}</span>
        {draft.error ? (
          <Button variant="ghost" size="sm" onClick={() => retry(draft)}>
            {t('retry')}
          </Button>
        ) : (
          <span className="task-chip saving">
            <LoaderCircle size={12} className="animate-spin" />
            {t('savingDraft')}
          </span>
        )}
      </div>
      {draft.error && (
        <p className="capture-error" role="alert">
          {t('captureDraftError', errorText(draft.error))}
        </p>
      )}
    </li>
  )
}

export function QuickCapture({
  hidden,
  onSubmit,
  announcement,
}: {
  hidden: boolean
  onSubmit: (title: string) => void
  announcement: string
}) {
  const { t } = useLanguage()
  return (
    <section
      className="quick-capture"
      aria-label={t('quickCapture')}
      hidden={hidden}
    >
      <CaptureEntry onSubmit={onSubmit} />
      <CaptureAnnouncement announcement={announcement} />
    </section>
  )
}

export function CaptureAnnouncement({
  announcement,
}: {
  announcement: string
}) {
  return (
    <p className="sr-only" role="status">
      {announcement}
    </p>
  )
}

export function CaptureEntry({
  onSubmit,
  canSubmit = true,
}: {
  onSubmit: (title: string) => void
  canSubmit?: boolean
}) {
  const { t } = useLanguage()
  const input = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const [draft, setDraft] = useState('')
  function submit() {
    if (!canSubmit || composing.current) return
    const title = taskTitle(draft)
    if (!title) return
    setDraft('')
    onSubmit(title)
    input.current?.focus({ preventScroll: true })
  }
  return (
    <div className="capture-entry">
      <Square className="capture-marker" size={17} aria-hidden="true" />
      <input
        ref={input}
        aria-label={t('quickCaptureName')}
        data-capture-entry
        value={draft}
        maxLength={200}
        placeholder={t('addTaskPlaceholder')}
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
        aria-label={t('addThisTask')}
        title={t('enterToAdd')}
        disabled={!canSubmit || !taskTitle(draft)}
        onClick={submit}
      >
        <CornerDownLeft />
      </Button>
    </div>
  )
}
