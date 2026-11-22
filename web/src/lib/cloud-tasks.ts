import { ApiError, type Action, type Task } from './api'

export type TaskInput = Partial<
  Pick<Task, 'scheduled_date' | 'project_id' | 'description' | 'links'>
> &
  Pick<Task, 'title'>

export type TaskAction = Action & { version: number }

function validLink(value: string) {
  if (!/^https?:\/\//i.test(value)) return false
  try {
    return !!new URL(value).hostname
  } catch {
    return false
  }
}

function validate(task: Task) {
  if (!task.title) throw new ApiError('請填寫任務名稱', 400)
  const value = task.scheduled_date
  if (value) {
    const date = new Date(value)
    if (
      !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new ApiError('任務日期須為有效的 YYYY-MM-DD，或留空', 400)
  }
  if (task.links.some(({ url }) => !validLink(url)))
    throw new ApiError('連結需要有效的 HTTP / HTTPS URL', 400)
  return task
}

function cleanLinks(links: Task['links'] = []) {
  return links.map(({ url }) => ({ url: url.trim() }))
}

export function createTask(
  input: TaskInput,
  id: string = crypto.randomUUID(),
): Task {
  const now = new Date().toISOString()
  return validate({
    id: id.replaceAll('-', ''),
    title: input.title.trim(),
    scheduled_date: input.scheduled_date ?? '',
    project_id: input.project_id || undefined,
    description: input.description ?? '',
    completed_at: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    version: 1,
    links: cleanLinks(input.links),
  })
}

export function editTask(
  task: Task,
  action: TaskAction | { op: 'restore'; version: number },
): Task {
  const now = new Date().toISOString()
  const next = { ...task, version: task.version + 1, updated_at: now }
  switch (action.op) {
    case 'restore':
      next.deleted_at = null
      return next
    case 'delete_item':
      next.deleted_at = now
      break
    case 'complete_task':
      if (task.completed_at) throw new ApiError('任務已完成', 400)
      next.completed_at = now
      break
    case 'reopen_task':
      if (!task.completed_at) throw new ApiError('任務尚未完成', 400)
      next.completed_at = null
      break
    case 'rename':
      if (!action.title?.trim()) throw new ApiError('標題不可空白', 400)
      next.title = action.title.trim()
      break
    case 'update':
      next.title = action.title?.trim() ?? task.title
      next.project_id =
        action.project_id === undefined
          ? task.project_id
          : action.project_id || undefined
      next.scheduled_date = action.scheduled_date ?? task.scheduled_date
      next.description = action.description ?? task.description
      break
    case 'add_link':
      if (!action.links?.length) throw new ApiError('請提供相關連結', 400)
      break
    case 'remove_link': {
      const index = action.link_index ?? -1
      if (!Number.isInteger(index) || index < 0 || index >= task.links.length)
        throw new ApiError('找不到指定的連結', 400)
      if (action.links?.length)
        throw new ApiError('刪除連結時不可同時新增連結', 400)
      next.links = task.links.filter((_, i) => i !== index)
      break
    }
  }
  if (action.links?.length)
    next.links = [...next.links, ...cleanLinks(action.links)]
  return validate(next)
}
