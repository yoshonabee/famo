import { notifyTasksChanged } from '@/lib/desktop'

export type Link = { url: string }
export type Project = {
  id: string
  name: string
  color: string
  version: number
}
export type Task = {
  id: string
  title: string
  scheduled_date: string
  project_id?: string
  description: string
  completed_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  version: number
  links: Link[]
}
export type Action = {
  op:
    | 'add_link'
    | 'remove_link'
    | 'update'
    | 'complete_task'
    | 'reopen_task'
    | 'rename'
    | 'delete_item'
  links?: Link[]
  link_index?: number
  scheduled_date?: string
  project_id?: string
  title?: string
  description?: string
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
  if (body !== undefined && path.startsWith('/tasks')) void notifyTasksChanged()
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
function fractionalSecond(timestamp: string) {
  return Number(timestamp.match(/\.\d+/)?.[0] ?? 0)
}

export function compareCompletionTime(a: Task, b: Task) {
  const first = a.completed_at ?? ''
  const second = b.completed_at ?? ''
  // The API includes fractional seconds beyond Date.parse's millisecond precision.
  return (
    Date.parse(second) - Date.parse(first) ||
    fractionalSecond(second) - fractionalSecond(first)
  )
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
