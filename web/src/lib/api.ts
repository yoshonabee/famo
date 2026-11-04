export type Step = { id: string; title: string; completed_at: string | null }
export type Link = { type: string; url: string }
export type Task = {
  id: string
  title: string
  goal: string
  context: string
  acceptance: string
  type: string
  stage: string
  priority: number
  waiting_reason: string
  waiting_since: string | null
  review_at: string | null
  completed_at: string | null
  deleted_at?: string | null
  created_at: string
  updated_at: string
  version: number
  steps: Step[]
  links: Link[]
  metadata: Record<string, unknown>
  history: {
    action: string
    source: string
    summary: string
    at: string
    version: number
  }[]
}
export type Workflow = { id: string; name: string; stages: string[] }
export type Action = {
  op:
    | 'complete_step'
    | 'update_next_step'
    | 'set_waiting'
    | 'resume'
    | 'add_link'
    | 'update'
    | 'complete_task'
    | 'reopen_task'
    | 'reopen_step'
    | 'rename'
    | 'delete_item'
  step_id?: string
  next_step?: string
  waiting_reason?: string
  review_at?: string
  stage?: string
  links?: Link[]
  title?: string
  goal?: string
  context?: string
  acceptance?: string
  priority?: number
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}
export async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(
    `/api${path}`,
    body === undefined
      ? { signal }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        },
  )
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.error || '操作失敗，請重試', res.status)
  return data as T
}
export function orderSubset(tasks: Task[], ids: string[]) {
  const selected = new Map(
    tasks.filter((t) => ids.includes(t.id)).map((t) => [t.id, t]),
  )
  const ordered = ids
    .map((id) => selected.get(id))
    .filter((t): t is Task => !!t)
  let index = 0
  return tasks.map((t) => (selected.has(t.id) ? ordered[index++] : t))
}
export const currentStep = (t: Task) => t.steps.find((s) => !s.completed_at)
export type Group = 'ready' | 'waiting' | 'review'
export function groupOf(t: Task, now: number): Group {
  if (t.review_at && new Date(t.review_at).getTime() <= now) return 'review'
  return t.waiting_reason ? 'waiting' : 'ready'
}
export const dateTime = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('zh-TW', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
