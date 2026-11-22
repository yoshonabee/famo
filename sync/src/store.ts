import type { Change, Operation } from './protocol'

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

function toChange(row: DocumentRow): Change {
  return {
    sequence: row.sequence,
    task: JSON.parse(row.document) as Change['task'],
  }
}
