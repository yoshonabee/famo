interface Task {
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
  links: { url: string }[]
}

export interface Operation {
  operation_id: string
  task_id: string
  base_version: number
  task: Task
}

export interface Change {
  sequence: number
  task: Task
}

export function parseOperation(value: unknown): Operation | null {
  if (
    !isRecord(value) ||
    !isID(value.operation_id) ||
    !isID(value.task_id) ||
    !isVersion(value.base_version) ||
    !isRecord(value.task)
  )
    return null

  const task = value.task
  if (
    task.id !== value.task_id ||
    !isVersion(task.version) ||
    task.version !== value.base_version + 1 ||
    typeof task.title !== 'string' ||
    !/\P{White_Space}/u.test(task.title) ||
    typeof task.description !== 'string' ||
    !(task.scheduled_date === '' || isDate(task.scheduled_date)) ||
    !(
      task.project_id === undefined ||
      task.project_id === '' ||
      isID(task.project_id)
    ) ||
    !isTimestamp(task.created_at) ||
    !isTimestamp(task.updated_at) ||
    !(task.completed_at === null || isTimestamp(task.completed_at)) ||
    !(task.deleted_at === null || isTimestamp(task.deleted_at)) ||
    !Array.isArray(task.links) ||
    !task.links.every(isLink)
  )
    return null

  // Keep a stable property order so retries compare the same document even if
  // the sender serializes keys in a different order.
  return {
    operation_id: value.operation_id,
    task_id: value.task_id,
    base_version: value.base_version,
    task: {
      id: value.task_id,
      title: task.title,
      scheduled_date: task.scheduled_date,
      ...(task.project_id ? { project_id: task.project_id } : {}),
      description: task.description,
      completed_at: task.completed_at,
      deleted_at: task.deleted_at,
      created_at: task.created_at,
      updated_at: task.updated_at,
      version: task.version,
      links: task.links.map(({ url }) => ({ url })),
    },
  }
}

export function parseCursor(value: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) return null
  const cursor = Number(value)
  return isVersion(cursor) ? cursor : null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isID(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
}

export function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const date = new Date(value)
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  )
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    ) &&
    isDate(value.slice(0, 10))
  )
}

function isLink(value: unknown): value is { url: string } {
  if (
    !isRecord(value) ||
    typeof value.url !== 'string' ||
    !/^https?:\/\//i.test(value.url)
  )
    return false
  return URL.canParse(value.url)
}
