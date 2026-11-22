import { isID, isRecord, isVersion } from './protocol'

interface Project {
  id: string
  name: string
  color: string
  position: number | null
}

interface Board {
  id: string
  name: string
  icon: string
  project_ids: string[]
}

interface Collections {
  projects: Project[]
  boards: Board[]
}

interface CollectionsOperation extends Collections {
  operation_id: string
  base_version: number
}

interface CollectionRow {
  version: number
  document: string
}

const boardIcons = new Set([
  'layout-grid',
  'briefcase',
  'house',
  'code',
  'shopping-cart',
  'music',
  'book-open',
  'heart',
  'dumbbell',
  'target',
  'calendar-days',
  'star',
])

function parseName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const start = value.search(/\P{White_Space}/u)
  if (start === -1) return null
  let end = value.length
  while (/\p{White_Space}/u.test(value[end - 1])) end--
  const name = value.slice(start, end)
  // A Unicode scalar takes at most two UTF-16 code units.
  if (name.length > 160 || [...name].length > 80 || /[\u0000\r\n]/u.test(name))
    return null
  return name
}

function parseProject(value: unknown): Project | null {
  if (!isRecord(value) || !isID(value.id)) return null
  const name = parseName(value.name)
  if (
    !name ||
    typeof value.color !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(value.color) ||
    !(value.position === null || isVersion(value.position))
  )
    return null
  return {
    id: value.id,
    name,
    color: value.color.toUpperCase(),
    position: value.position,
  }
}

function parseBoard(value: unknown, projectIDs: Set<string>): Board | null {
  if (!isRecord(value) || !isID(value.id)) return null
  const name = parseName(value.name)
  if (
    !name ||
    typeof value.icon !== 'string' ||
    !boardIcons.has(value.icon) ||
    !Array.isArray(value.project_ids)
  )
    return null

  const ids = new Set<string>()
  for (const id of value.project_ids) {
    if (typeof id !== 'string' || !projectIDs.has(id) || ids.has(id))
      return null
    ids.add(id)
  }
  return {
    id: value.id,
    name,
    icon: value.icon,
    project_ids: [...ids].sort(),
  }
}

function byID(a: { id: string }, b: { id: string }): number {
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

function nameKey(name: string): string {
  // SQLite NOCASE only folds ASCII letters.
  return name.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

export function parseCollectionsOperation(
  value: unknown,
): CollectionsOperation | null {
  if (
    !isRecord(value) ||
    !isID(value.operation_id) ||
    !isVersion(value.base_version) ||
    value.base_version >= Number.MAX_SAFE_INTEGER ||
    !Array.isArray(value.projects) ||
    !Array.isArray(value.boards)
  )
    return null

  const projects: Project[] = []
  const projectIDs = new Set<string>()
  const projectNames = new Set<string>()
  for (const entry of value.projects) {
    const project = parseProject(entry)
    if (!project) return null
    const name = nameKey(project.name)
    if (projectIDs.has(project.id) || projectNames.has(name)) return null
    projects.push(project)
    projectIDs.add(project.id)
    projectNames.add(name)
  }

  const boards: Board[] = []
  const boardIDs = new Set<string>()
  const boardNames = new Set<string>()
  for (const entry of value.boards) {
    const board = parseBoard(entry, projectIDs)
    if (!board) return null
    const name = nameKey(board.name)
    if (boardIDs.has(board.id) || boardNames.has(name)) return null
    boards.push(board)
    boardIDs.add(board.id)
    boardNames.add(name)
  }

  return {
    operation_id: value.operation_id,
    base_version: value.base_version,
    projects: projects.sort(byID),
    boards: boards.sort(byID),
  }
}

function snapshot(row: CollectionRow | null) {
  if (!row) return { version: 0, projects: [], boards: [] }
  return { version: row.version, ...(JSON.parse(row.document) as Collections) }
}

function latest(db: D1Database, accountID: string) {
  return db
    .prepare(
      `SELECT version, document FROM sync_collections
       WHERE account_id = ? ORDER BY version DESC LIMIT 1`,
    )
    .bind(accountID)
}

export async function getCollections(db: D1Database, accountID: string) {
  return snapshot(await latest(db, accountID).first<CollectionRow>())
}

export async function pushCollections(
  db: D1Database,
  accountID: string,
  operation: CollectionsOperation,
) {
  const {
    operation_id: operationID,
    base_version: baseVersion,
    projects,
    boards,
  } = operation
  const document = JSON.stringify({ projects, boards })
  const version = baseVersion + 1
  // The same immutable row records the accepted snapshot and its receipt.
  // D1 executes the guarded write and both reads in one transaction.
  const [, receipts, current] = await db.batch<CollectionRow>([
    db
      .prepare(
        `INSERT INTO sync_collections (account_id, version, operation_id, document)
         SELECT ?1, ?2, ?3, ?4
         WHERE NOT EXISTS (
           SELECT 1 FROM sync_collections WHERE account_id = ?1 AND operation_id = ?3
         ) AND COALESCE((
           SELECT MAX(version) FROM sync_collections WHERE account_id = ?1
         ), 0) = ?5`,
      )
      .bind(accountID, version, operationID, document, baseVersion),
    db
      .prepare(
        `SELECT version, document FROM sync_collections
         WHERE account_id = ? AND operation_id = ?`,
      )
      .bind(accountID, operationID),
    latest(db, accountID),
  ])
  const receipt = receipts.results[0]
  if (receipt) {
    if (receipt.version !== version || receipt.document !== document) {
      return {
        status: 400,
        body: { error: 'Operation ID already used' },
      } as const
    }
    return { status: 200, body: snapshot(receipt) } as const
  }
  return {
    status: 409,
    body: { current: snapshot(current.results[0] ?? null) },
  } as const
}
