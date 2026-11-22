import type { Change, Operation } from './protocol'
import { MAX_BATCH_BYTES } from './protocol'

interface DocumentRow {
  sequence: number
  document: string
}

const PAGE_SIZE = 20
const PAGE_BYTES = 4 * 1024 * 1024

export async function pull(db: D1Database, accountID: string, after: number) {
  const { results } = await db
    .prepare(
      `
    WITH candidates AS (
      SELECT sequence, document FROM sync_changes
      WHERE account_id = ? AND sequence > ?
      ORDER BY sequence LIMIT ?
    ), sized AS (
      SELECT sequence, document, count(*) OVER () AS candidate_count,
        row_number() OVER (ORDER BY sequence) AS row_number,
        sum(length(CAST(document AS BLOB))) OVER (ORDER BY sequence) AS cumulative_bytes
      FROM candidates
    )
    SELECT sequence, document, candidate_count FROM sized
    WHERE row_number <= ? AND cumulative_bytes <= ? ORDER BY sequence
  `,
    )
    .bind(accountID, after, PAGE_SIZE + 1, PAGE_SIZE, PAGE_BYTES)
    .all<DocumentRow & { candidate_count: number }>()
  const changes = results.map(toChange)
  return {
    changes,
    cursor: changes.at(-1)?.sequence ?? after,
    has_more: (results[0]?.candidate_count ?? 0) > results.length,
  }
}

export async function push(
  db: D1Database,
  accountID: string,
  operation: Operation,
) {
  const {
    operation_id: operationID,
    task_id: taskID,
    base_version: baseVersion,
    task,
  } = operation
  const document = JSON.stringify(task)

  // D1 runs the whole batch in one transaction. The guarded INSERT claims the
  // operation ID and records the change, and the trigger updates its current
  // version in the same statement. Every outcome is read in that transaction.
  const [, receipt, current] = await db.batch<DocumentRow>([
    db
      .prepare(
        `
      INSERT INTO sync_changes (account_id, operation_id, task_id, version, document)
      SELECT ?1, ?2, ?3, ?4, ?5
      WHERE NOT EXISTS (
          SELECT 1 FROM sync_changes WHERE account_id = ?1 AND operation_id = ?2
      ) AND COALESCE((
          SELECT version FROM sync_tasks WHERE account_id = ?1 AND task_id = ?3
      ), 0) = ?6
    `,
      )
      .bind(
        accountID,
        operationID,
        taskID,
        task.version,
        document,
        baseVersion,
      ),
    db
      .prepare(
        `
      SELECT sequence, document FROM sync_changes WHERE account_id = ? AND operation_id = ?
    `,
      )
      .bind(accountID, operationID),
    db
      .prepare(
        `
      SELECT c.sequence, c.document FROM sync_tasks t JOIN sync_changes c USING (sequence)
      WHERE t.account_id = ? AND t.task_id = ?
    `,
      )
      .bind(accountID, taskID),
  ])
  const previous = receipt.results[0]
  if (previous) {
    if (previous.document !== document)
      return {
        status: 400,
        body: { error: 'Operation ID already used' },
      } as const
    return { status: 200, body: { change: toChange(previous) } } as const
  }
  const latest = current.results[0]
  return {
    status: 409,
    body: { current: latest ? toChange(latest).task : null },
  } as const
}

const batchInput = `
  SELECT CAST(key AS INTEGER) AS ordinal,
    json_extract(value, '$.operation_id') AS operation_id,
    json_extract(value, '$.task_id') AS task_id,
    json_extract(value, '$.base_version') AS base_version,
    json_extract(value, '$.task.version') AS version,
    json_extract(value, '$.task') AS document
  FROM json_each(?2)
`

export async function pushBatch(
  db: D1Database,
  accountID: string,
  operations: Operation[],
) {
  const input = JSON.stringify(operations)
  if (new TextEncoder().encode(input).length > MAX_BATCH_BYTES)
    return {
      status: 413,
      body: { error: 'Batch is too large to sync' },
    } as const

  // Materialize the checked rows before the publish trigger updates any task.
  // A single JSON input keeps the parameter count constant for large selections.
  const [, receipts] = await db.batch<DocumentRow & { matches: number }>([
    db
      .prepare(
        `
      WITH incoming AS MATERIALIZED (${batchInput}), eligible AS MATERIALIZED (
        SELECT * FROM incoming WHERE NOT EXISTS (
          SELECT 1 FROM incoming i
          LEFT JOIN sync_tasks t ON t.account_id = ?1 AND t.task_id = i.task_id
          LEFT JOIN sync_changes c ON c.account_id = ?1 AND c.operation_id = i.operation_id
          WHERE COALESCE(t.version, 0) <> i.base_version OR c.sequence IS NOT NULL
        )
      )
      INSERT INTO sync_changes (account_id, operation_id, task_id, version, document)
      SELECT ?1, operation_id, task_id, version, document FROM eligible ORDER BY ordinal
    `,
      )
      .bind(accountID, input),
    db
      .prepare(
        `
      WITH incoming AS (${batchInput})
      SELECT c.sequence, c.document, c.document = i.document AS matches
      FROM incoming i
      JOIN sync_changes c ON c.account_id = ?1 AND c.operation_id = i.operation_id
      ORDER BY i.ordinal
    `,
      )
      .bind(accountID, input),
  ])
  if (receipts.results.some(({ matches }) => !matches))
    return {
      status: 400,
      body: { error: 'Operation ID already used' },
    } as const
  if (receipts.results.length !== operations.length)
    return { status: 409, body: { error: 'Version conflict' } } as const
  return {
    status: 200,
    body: { changes: receipts.results.map(toChange) },
  } as const
}

function toChange(row: DocumentRow): Change {
  return {
    sequence: row.sequence,
    task: JSON.parse(row.document) as Change['task'],
  }
}
