import { ApiError, type Task } from './api'
import { observeCloudVersion, webProtocol } from './cloud-version'

export type Operation = {
  operation_id: string
  task_id: string
  base_version: number
  task: Task
}

export type Change = { sequence: number; task: Task }
export type CloudProject = {
  id: string
  name: string
  color: string
  position: number | null
}

export type CloudBoard = {
  id: string
  name: string
  icon: string
  project_ids: string[]
}

export type Collections = {
  version: number
  projects: CloudProject[]
  boards: CloudBoard[]
}

type Page = { changes: Change[]; cursor: number; has_more: boolean }

export type Write =
  | { endpoint: 'push'; body: Operation }
  | { endpoint: 'push-batch'; body: { operations: Operation[] } }
  | {
      endpoint: 'collections'
      body: Omit<Collections, 'version'> & {
        base_version: number
        operation_id: string
      }
    }

export type WriteResult = {
  change?: Change
  changes?: Change[]
  current?: Task | Collections | null
} & Partial<Collections>

export function operationFor(task: Task): Operation {
  return {
    operation_id: crypto.randomUUID(),
    task_id: task.id,
    base_version: task.version - 1,
    task,
  }
}

export class CloudConflict extends ApiError {
  constructor(readonly current: WriteResult['current']) {
    super('任務已被更新，請重新讀取後再操作', 409)
  }
}

export async function syncRequest<T>(endpoint: string, body?: object) {
  let response: Response
  let data: T & { current?: WriteResult['current'] }
  try {
    response = await fetch(`/api/sync/${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'X-Famo-Web-Protocol': String(webProtocol),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
    if (
      response.type === 'opaqueredirect' ||
      [401, 403].includes(response.status)
    )
      throw new ApiError('登入已失效或沒有存取權限，請重新載入頁面。', 401)
    observeCloudVersion(response.headers)
    if (response.status === 412)
      throw new ApiError('請重新整理以繼續同步。', 412)
    data = await response.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('目前無法連線同步，請再試一次。', 0)
  }
  if (response.status === 409) throw new CloudConflict(data.current)
  if (!response.ok) {
    throw new ApiError(
      response.status === 413 ? '同步資料超過大小限制' : '操作失敗，請重試',
      response.status,
    )
  }
  return data as T
}

export async function pull(after: number, limit?: number): Promise<Page> {
  const query = new URLSearchParams({ after: String(after) })
  if (limit !== undefined) query.set('limit', String(limit))
  const page = await syncRequest<Page>(`pull?${query}`)
  let cursor = after
  for (const change of page.changes) {
    if (!Number.isSafeInteger(change.sequence) || change.sequence <= cursor)
      throw new Error('Invalid sync sequence')
    cursor = change.sequence
  }
  if (cursor !== page.cursor || (page.has_more && cursor === after))
    throw new Error('Invalid sync cursor')
  return page
}
