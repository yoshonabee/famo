import { boardIcons, defaultBoardIcon } from '@/components/board-icons'
import { projectColors } from '@/components/project-appearance'
import {
  ApiError,
  orderSubset,
  type Board,
  type Project,
  type Task,
} from './api'
import {
  CloudConflict,
  operationFor,
  pull,
  syncRequest,
  type CloudBoard,
  type CloudProject,
  type Collections,
  type Write,
  type WriteResult,
} from './cloud-transport'
import {
  createTask,
  editTask,
  type TaskAction,
  type TaskInput,
} from './cloud-tasks'
import { setCloudSyncStatus } from './sync-status'

type CollectionPath = 'boards' | 'projects'
type CollectionInput = {
  name: string
  color?: string
  icon?: string
  project_ids?: string[]
  version?: number
}
type TaskVersion = Pick<Task, 'id' | 'version'>
type JournalEntry = [string, Write]

const emptyCollections: Collections = { version: 0, projects: [], boards: [] }
const tasks = new Map<string, Task>()
const pendingKey = 'famo.sync.writes.v1'
const legacyPendingKey = 'famo.sync.pending.v1'
const legacyCollectionsKey = 'famo.sync.collections.pending.v1'
const orderKey = 'famo.sync.task-order.v1'
const retention = 7 * 24 * 60 * 60 * 1000

function readJournal(): Map<string, Write> {
  try {
    const entries: JournalEntry[] = JSON.parse(
      sessionStorage.getItem(pendingKey) ?? '[]',
    )
    const journal = new Map(entries)
    const legacyTask = sessionStorage.getItem(legacyPendingKey)
    const legacyCollections = sessionStorage.getItem(legacyCollectionsKey)
    if (legacyTask)
      journal.set('legacy-task', {
        endpoint: 'push',
        body: JSON.parse(legacyTask),
      })
    if (legacyCollections)
      journal.set('legacy-collections', {
        endpoint: 'collections',
        body: JSON.parse(legacyCollections),
      })
    if (legacyTask || legacyCollections) {
      sessionStorage.setItem(pendingKey, JSON.stringify([...journal]))
      sessionStorage.removeItem(legacyPendingKey)
      sessionStorage.removeItem(legacyCollectionsKey)
    }
    return journal
  } catch {
    return new Map()
  }
}

const journal = readJournal()
let order: string[] = []
try {
  order = JSON.parse(localStorage.getItem(orderKey) ?? '[]')
} catch {
  // In-memory ordering is still available.
}

let cursor = 0
let taskPull: Promise<void> | undefined
let collectionPull: Promise<void> | undefined
let collections = emptyCollections
let receivedCollections = false
let receivedTasks = false
let activeReads = 0
let activeWrites = 0
const writeProblems = new Map<string, 'error' | 'conflict'>()
const failedReads = new Set<'tasks' | 'collections'>()
let writes: Promise<unknown> = Promise.resolve()
let pendingTaskWrite: Promise<WriteResult> | undefined
const acknowledgedTaskSequences = new Set<number>()

function publishStatus() {
  const unsyncedCount = [...journal.values()].reduce(
    (count, write) =>
      count +
      (write.endpoint === 'push-batch' ? write.body.operations.length : 1),
    0,
  )
  if ([...writeProblems.values()].includes('conflict'))
    setCloudSyncStatus('conflict', unsyncedCount)
  else if (failedReads.size || writeProblems.size)
    setCloudSyncStatus('error', unsyncedCount)
  else if (activeReads || activeWrites)
    setCloudSyncStatus('syncing', unsyncedCount)
  else if (journal.size || !receivedTasks || !receivedCollections)
    setCloudSyncStatus('pending', unsyncedCount)
  else setCloudSyncStatus('synced', unsyncedCount)
}

publishStatus()

function remember(key: string, write?: Write) {
  if (write) journal.set(key, write)
  else journal.delete(key)
  try {
    if (journal.size)
      sessionStorage.setItem(pendingKey, JSON.stringify([...journal]))
    else sessionStorage.removeItem(pendingKey)
  } catch {
    // The current tab can retry using the in-memory operation ID.
  }
  publishStatus()
}

function applyTask(task: Task) {
  if (task.version > (tasks.get(task.id)?.version ?? 0))
    tasks.set(task.id, task)
}

function applyCollections(snapshot: Collections) {
  if (snapshot.version >= collections.version) collections = snapshot
}

function applyWrite(result: WriteResult) {
  const changes = result.change ? [result.change] : (result.changes ?? [])
  for (const change of changes) {
    applyTask(change.task)
    acknowledgedTaskSequences.add(change.sequence)
  }
  // Keep recent acknowledgements for echoes that arrive after the HTTP reply.
  for (const sequence of acknowledgedTaskSequences) {
    if (acknowledgedTaskSequences.size <= 128) break
    acknowledgedTaskSequences.delete(sequence)
  }
  if (result.version !== undefined && result.projects && result.boards)
    applyCollections({
      version: result.version,
      projects: result.projects,
      boards: result.boards,
    })
}

async function send(key: string, write: Write) {
  remember(key, write)
  const scopes =
    write.endpoint === 'collections'
      ? ['collections']
      : write.endpoint === 'push-batch'
        ? write.body.operations.map(({ task_id }) => `task:${task_id}`)
        : [`task:${write.body.task_id}`]
  try {
    const response = syncRequest<WriteResult>(write.endpoint, write.body).then(
      (result) => {
        applyWrite(result)
        return result
      },
    )
    if (write.endpoint !== 'collections') pendingTaskWrite = response
    const result = await response
    for (const scope of scopes) writeProblems.delete(scope)
    remember(key)
    return result
  } catch (error) {
    for (const scope of scopes)
      writeProblems.set(
        scope,
        error instanceof CloudConflict ? 'conflict' : 'error',
      )
    if (
      error instanceof ApiError &&
      [400, 404, 409, 413, 415, 422].includes(error.status)
    )
      remember(key)
    if (error instanceof CloudConflict && error.current) {
      if ('id' in error.current) applyTask(error.current)
      else applyCollections(error.current)
    }
    throw error
  } finally {
    if (write.endpoint !== 'collections') pendingTaskWrite = undefined
  }
}

export async function isAcknowledgedTaskWrite(sequence: number) {
  // The WebSocket echo can arrive before the HTTP acknowledgement.
  await pendingTaskWrite?.catch(() => {})
  return acknowledgedTaskSequences.has(sequence)
}

function serialWrite<T>(run: () => Promise<T>) {
  activeWrites++
  publishStatus()
  const result = writes.then(run).finally(() => {
    activeWrites--
    publishStatus()
  })
  writes = result.catch(() => {})
  return result
}

const recoveredKeys = new Set(journal.keys())
let recovery: Promise<void> | undefined

function recoverWrites() {
  if (!recoveredKeys.size || !navigator.onLine) return
  return (recovery ??= serialWrite(async () => {
    for (const key of recoveredKeys) {
      const write = journal.get(key)
      if (write) {
        try {
          await send(key, write)
        } catch {
          if (journal.has(key)) return
        }
      }
      recoveredKeys.delete(key)
    }
  }).finally(() => {
    recovery = undefined
  }))
}

async function trackRead(
  kind: 'tasks' | 'collections',
  run: () => Promise<void>,
) {
  activeReads++
  publishStatus()
  try {
    await run()
    failedReads.delete(kind)
  } catch (error) {
    failedReads.add(kind)
    throw error
  } finally {
    activeReads--
    publishStatus()
  }
}

export async function waitForCloudReads() {
  await Promise.allSettled([taskPull, collectionPull])
}

function refreshTasks() {
  return (taskPull ??= trackRead('tasks', async () => {
    let more: boolean
    do {
      const page = await pull(cursor)
      for (const change of page.changes) applyTask(change.task)
      cursor = page.cursor
      more = page.has_more
    } while (more)
    receivedTasks = true
  }).finally(() => {
    taskPull = undefined
  }))
}

function refreshCollections() {
  return (collectionPull ??= trackRead('collections', async () => {
    applyCollections(await syncRequest<Collections>('collections'))
    receivedCollections = true
  }).finally(() => {
    collectionPull = undefined
  }))
}

function visibleTask(task: Task): Task {
  if (
    !receivedCollections ||
    !task.project_id ||
    collections.projects.some(({ id }) => id === task.project_id)
  )
    return task
  return { ...task, project_id: undefined }
}

function listTasks() {
  const listed = [...tasks.values()]
    .filter(({ deleted_at }) => !deleted_at)
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        a.id.localeCompare(b.id),
    )
  const ordered = new Set(order)
  const byID = new Map(listed.map((task) => [task.id, task]))
  return [
    ...order.map((id) => byID.get(id)).filter((task) => task !== undefined),
    ...listed.filter(({ id }) => !ordered.has(id)),
  ].map(visibleTask)
}

function recent(task: Task) {
  return task.deleted_at && Date.parse(task.deleted_at) > Date.now() - retention
}

function listRecentlyDeletedTasks() {
  return [...tasks.values()]
    .filter(recent)
    .sort((a, b) => Date.parse(b.deleted_at!) - Date.parse(a.deleted_at!))
    .map(visibleTask)
}

export function getCloudTaskLists() {
  if (receivedTasks)
    return { tasks: listTasks(), recentlyDeleted: listRecentlyDeletedTasks() }
}

async function requireTask({ id, version }: TaskVersion, deleted = false) {
  if (!tasks.has(id)) await refreshTasks()
  const task = tasks.get(id)
  if (!task || (deleted ? !recent(task) : task.deleted_at))
    throw new ApiError('找不到任務', 404)
  if (task.version !== version) {
    writeProblems.set(`task:${id}`, 'conflict')
    throw new CloudConflict(task)
  }
  return task
}

async function requireProject(id?: string) {
  if (!id) return
  if (!receivedCollections) await refreshCollections()
  if (!collections.projects.some((project) => project.id === id))
    throw new ApiError('找不到指定的 Project', 404)
}

function projectOrder(a: CloudProject, b: CloudProject) {
  return (a.position ?? Infinity) - (b.position ?? Infinity) || nameOrder(a, b)
}

function nameOrder(a: CloudProject | CloudBoard, b: CloudProject | CloudBoard) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}

function listProjects(snapshot: Collections): Project[] {
  return [...snapshot.projects]
    .sort(projectOrder)
    .map(({ id, name, color }) => ({
      id,
      name,
      color,
      version: snapshot.version,
      workspace_dir: '',
      workspace_prompt: '',
    }))
}

function listBoards(snapshot: Collections): Board[] {
  return [...snapshot.boards].sort(nameOrder).map((board) => ({
    ...board,
    version: snapshot.version,
  }))
}

function validateName(name: string, kind: 'Project' | 'Board') {
  const trimmed = name.trim()
  if (!trimmed || [...trimmed].length > 80 || /[\u0000\r\n]/u.test(trimmed))
    throw new ApiError(`${kind} 名稱須為 1 到 80 個字元，且不可換行`, 400)
  return trimmed
}

function nameKey(name: string) {
  return name.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

function validateUnique<T extends { id: string; name: string }>(
  items: T[],
  item: T,
  kind: 'Project' | 'Board',
) {
  if (
    items.some(
      ({ id, name }) => id !== item.id && nameKey(name) === nameKey(item.name),
    )
  )
    throw new ApiError(`已有同名的 ${kind}`, 400)
  return item
}

function editCollections(
  kind: CollectionPath,
  id: string | undefined,
  remove: boolean,
  input: CollectionInput,
) {
  const label = kind === 'projects' ? 'Project' : 'Board'
  if (id && !collections[kind].some((item) => item.id === id))
    throw new ApiError(`找不到 ${label}`, 404)
  if (id && input.version !== collections.version) {
    writeProblems.set('collections', 'conflict')
    throw new CloudConflict(collections)
  }
  if (remove) {
    return {
      projects:
        kind === 'projects'
          ? collections.projects.filter((project) => project.id !== id)
          : collections.projects,
      boards:
        kind === 'boards'
          ? collections.boards.filter((board) => board.id !== id)
          : collections.boards.map((board) => ({
              ...board,
              project_ids: board.project_ids.filter(
                (project) => project !== id,
              ),
            })),
    }
  }
  const name = validateName(input.name, label)
  if (kind === 'projects') {
    const existing = collections.projects.find((project) => project.id === id)
    const paletteColor =
      projectColors[Math.floor(Math.random() * projectColors.length)].value
    const color = (input.color ?? existing?.color ?? paletteColor).toUpperCase()
    if (!/^#[0-9A-F]{6}$/.test(color))
      throw new ApiError('Project 顏色須為 #RRGGBB 色碼', 400)
    const positions = collections.projects.flatMap(({ position }) =>
      position === null ? [] : [position],
    )
    const position = existing
      ? existing.position
      : positions.length
        ? Math.max(...positions) + 1
        : null
    const project = validateUnique(
      collections.projects,
      {
        id: id ?? crypto.randomUUID(),
        name,
        color,
        position,
      },
      label,
    )
    return {
      projects: [
        ...collections.projects.filter((item) => item.id !== id),
        project,
      ],
      boards: collections.boards,
      id: project.id,
    }
  }
  const project_ids = input.project_ids ?? []
  if (new Set(project_ids).size !== project_ids.length)
    throw new ApiError('Project ID 不可空白或重複', 400)
  if (
    project_ids.some(
      (project) => !collections.projects.some(({ id }) => id === project),
    )
  )
    throw new ApiError('找不到指定的 Project', 404)
  const icon = input.icon || defaultBoardIcon
  if (!boardIcons.some(({ value }) => value === icon))
    throw new ApiError('請選擇支援的 Board 圖示', 400)
  const board = validateUnique(
    collections.boards,
    {
      id: id ?? crypto.randomUUID(),
      name,
      icon,
      project_ids,
    },
    label,
  )
  return {
    projects: collections.projects,
    boards: [...collections.boards.filter((item) => item.id !== id), board],
    id: board.id,
  }
}

async function writeCollections(path: string, body: unknown, key: string) {
  const [, kind, id, action] = path.split('/') as [
    string,
    CollectionPath,
    string?,
    string?,
  ]
  const pending = journal.get(key)
  if (!receivedCollections) await refreshCollections()
  let savedId = id
  let write = pending
  if (!write) {
    let next: Omit<Collections, 'version'>
    if (kind === 'projects' && id === 'reorder') {
      const { project_ids } = body as { project_ids: string[] }
      if (project_ids.length < 2)
        throw new ApiError('排序至少需要兩個 Project', 400)
      if (
        new Set(project_ids).size !== project_ids.length ||
        project_ids.some(
          (project) =>
            !collections.projects.some((item) => item.id === project),
        )
      )
        throw new ApiError('Project 列表已變更，請重新讀取後再排序', 409)
      const projects = orderSubset(
        [...collections.projects].sort(projectOrder),
        project_ids,
      ).map((project, position) => ({ ...project, position }))
      next = { projects, boards: collections.boards }
    } else {
      const { id: editedID, ...edited } = editCollections(
        kind,
        id,
        action === 'delete',
        body as CollectionInput,
      )
      savedId = editedID ?? id
      next = edited
    }
    write = {
      endpoint: 'collections',
      body: {
        ...next,
        base_version: collections.version,
        operation_id: crypto.randomUUID(),
      },
    }
  } else if (write.endpoint === 'collections' && !id) {
    savedId = write.body[kind].find(
      ({ name }) => name === (body as CollectionInput).name.trim(),
    )?.id
  }
  const result = (await send(key, write)) as Collections
  if (action === 'delete' || id === 'reorder') return undefined
  const items = kind === 'projects' ? listProjects(result) : listBoards(result)
  return items.find((item) => item.id === savedId)
}

async function writeTasks(path: string, body: unknown, key: string) {
  if (path === '/tasks/reorder') {
    const ids = (body as { task_ids: string[] }).task_ids
    if (ids.length < 2) throw new ApiError('排序至少需要兩件任務', 400)
    if (new Set(ids).size !== ids.length)
      throw new ApiError('任務 ID 不可空白或重複', 400)
    if (
      ids.some(
        (id) =>
          !tasks.has(id) ||
          tasks.get(id)?.completed_at ||
          tasks.get(id)?.deleted_at,
      )
    )
      throw new ApiError('排序包含不存在或已完成的任務，請重新讀取', 409)
    order = orderSubset(listTasks(), ids).map(({ id }) => id)
    try {
      localStorage.setItem(orderKey, JSON.stringify(order))
    } catch {
      // Keep this tab's order when storage is unavailable.
    }
    return listTasks()
  }

  const batch = path === '/tasks/assign-project'
  let write = journal.get(key)
  if (!write) {
    if (path === '/tasks') {
      const input = body as TaskInput & { draft_id?: string }
      await requireProject(input.project_id)
      write = {
        endpoint: 'push',
        body: operationFor(createTask(input, input.draft_id)),
      }
    } else if (batch) {
      const input = body as { project_id: string; tasks: TaskVersion[] }
      if (!input.tasks.length) throw new ApiError('請選擇至少一件任務', 400)
      await requireProject(input.project_id)
      const originals = await Promise.all(
        input.tasks.map((task) => requireTask(task)),
      )
      const operations = originals.map((task) =>
        operationFor(
          editTask(task, {
            op: 'update',
            project_id: input.project_id,
            version: task.version,
          }),
        ),
      )
      write = { endpoint: 'push-batch', body: { operations } }
    } else {
      const [, , id, action] = path.split('/')
      const input = body as TaskAction
      const restore = action === 'restore'
      const original = await requireTask(
        { id, version: input.version },
        restore,
      )
      await requireProject(input.project_id)
      write = {
        endpoint: 'push',
        body: operationFor(
          editTask(
            original,
            restore ? { op: 'restore', version: input.version } : input,
          ),
        ),
      }
    }
  }
  const result = await send(key, write)
  if (batch && result.changes)
    return result.changes.map(({ task }) => visibleTask(task))
  if (result.change) return visibleTask(result.change.task)
  throw new ApiError('操作失敗，請重試', 500)
}

export async function cloudRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  await recoverWrites()
  let result: unknown
  if (body !== undefined) {
    const key = JSON.stringify([path, body])
    if (
      /^\/tasks(?:\/(?:reorder|assign-project|[^/]+\/(?:actions|restore)))?$/.test(
        path,
      )
    )
      result = await serialWrite(() => writeTasks(path, body, key))
    else if (/^\/(boards|projects)(?:\/[^/]+(?:\/delete)?)?$/.test(path))
      result = await serialWrite(() => writeCollections(path, body, key))
    else throw new ApiError('找不到 API', 404)
  } else if (path === '/projects' || path === '/boards') {
    await refreshCollections()
    result =
      path === '/projects' ? listProjects(collections) : listBoards(collections)
  } else if (path === '/tasks' || path === '/tasks/recently-deleted') {
    await Promise.all([refreshTasks(), refreshCollections().catch(() => {})])
    result = path === '/tasks' ? listTasks() : listRecentlyDeletedTasks()
  } else {
    throw new ApiError('找不到 API', 404)
  }
  return result as T
}
