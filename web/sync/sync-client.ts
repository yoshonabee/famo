import type { Task } from '../src/lib/api'

export type Operation = {
  operation_id: string
  task_id: string
  base_version: number
  task: Task
}

type Change = { sequence: number; task: Task }
type Pull = { changes: Change[]; cursor: number; has_more: boolean }

export class SyncError extends Error {
  constructor(readonly status: number) {
    super(`Sync request failed (${status})`)
  }
}

export async function request(endpoint: string, body?: object) {
  const response = await fetch(`/api/sync/${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  })
  if (response.type === 'opaqueredirect') throw new SyncError(401)
  return response
}

export async function pull(after: number): Promise<Pull> {
  const response = await request(`pull?after=${after}`)
  if (!response.ok) throw new SyncError(response.status)
  const page: Pull = await response.json()
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

export async function push(operation: Operation) {
  const response = await request('push', operation)
  if (response.status === 409) {
    const { current }: { current: Task | null } = await response.json()
    return { kind: 'conflict', current } as const
  }
  if (!response.ok) throw new SyncError(response.status)
  const { change }: { change: Change } = await response.json()
  return { kind: 'saved', task: change.task } as const
}

export function operationFor(task: Task): Operation {
  return {
    operation_id: crypto.randomUUID(),
    task_id: task.id,
    base_version: task.version - 1,
    task,
  }
}
