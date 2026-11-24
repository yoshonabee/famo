import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { Context, MiddlewareHandler } from 'hono'
import { authorize } from './access'
import { SyncEvents, type SyncEvent } from './events'
import {
  getCollections,
  parseCollectionsOperation,
  pushCollections,
} from './collections'
import type { AccessBindings } from './access'
import {
  MAX_BATCH_BYTES,
  parseCursor,
  parseOperation,
  parseOperations,
} from './protocol'
import type { Operation } from './protocol'
import { pull, push, pushBatch } from './store'

export { SyncEvents }

type Env = {
  Bindings: AccessBindings & {
    DB: D1Database
    ASSETS?: Fetcher
    SYNC_EVENTS?: DurableObjectNamespace
    MIN_WEB_PROTOCOL?: string
  }
  Variables: { accountID: string }
}

const sync = new Hono<Env>()

const requireAccess =
  (api: boolean): MiddlewareHandler<Env> =>
  async (c, next) => {
    c.header('Cache-Control', 'no-store')
    const identity = await authorize(c.req.raw, c.env, api)
    if (!identity) return c.json({ error: 'Access denied' }, 403)

    if (api) {
      const expected = c.req.header('X-Famo-Sync-Account')
      if (expected !== undefined && expected !== identity.accountID) {
        return c.json({ error: 'Unexpected sync account' }, 403)
      }
      c.header('X-Famo-Sync-Account', identity.accountID)
      const upgrade = checkWebProtocol(c, identity.service)
      if (upgrade) return upgrade
    }

    if (c.req.method === 'POST' && !identity.service) {
      // Browsers include Origin on fetch POST. Service clients are authenticated
      // independently of cookies and can omit it.
      if (c.req.header('Origin') !== new URL(c.req.url).origin) {
        return c.json({ error: 'Invalid origin' }, 403)
      }
    }
    c.set('accountID', identity.accountID)
    await next()
  }

function checkWebProtocol(
  c: Context<Env>,
  service: boolean,
  advertised = c.req.header('X-Famo-Web-Protocol'),
) {
  if (service) return
  const minimum = Number(c.env.MIN_WEB_PROTOCOL ?? '0')
  const protocol = Number(advertised ?? '0')
  if (
    Number.isSafeInteger(minimum) &&
    minimum > 0 &&
    (!Number.isSafeInteger(protocol) || protocol < minimum)
  ) {
    c.header('X-Famo-Web-Min-Protocol', String(minimum))
    return c.json({ error: 'Reload Famo to continue syncing' }, 412)
  }
}

function publish(c: Context<Env>, event: SyncEvent) {
  const events = c.env.SYNC_EVENTS
  if (!events) return
  c.executionCtx.waitUntil(
    events
      .getByName(c.get('accountID'))
      .fetch('https://events.internal/', {
        method: 'POST',
        body: JSON.stringify(event),
      })
      .catch(() => {
        console.error('Famo sync notification failed')
      }),
  )
}

sync.get('/events', async (c) => {
  const identity = await authorize(c.req.raw, c.env, true)
  const expected = c.req.header('X-Famo-Sync-Account')
  if (
    !identity ||
    (expected !== undefined && expected !== identity.accountID) ||
    (!identity.service && c.req.header('Origin') !== new URL(c.req.url).origin)
  )
    return c.json({ error: 'Access denied' }, 403)

  const upgrade = checkWebProtocol(
    c,
    identity.service,
    c.req.query('protocol') ?? '0',
  )
  if (upgrade) return upgrade
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket')
    return c.json({ error: 'Expected a WebSocket connection' }, 400)
  const events = c.env.SYNC_EVENTS
  if (!events) return c.notFound()

  return events
    .getByName(identity.accountID)
    .fetch('https://events.internal/', {
      headers: {
        Upgrade: 'websocket',
        'X-Famo-Sync-Account': identity.accountID,
        'X-Famo-Session-Expiry': String(
          identity.expiresAt ?? Number.MAX_SAFE_INTEGER,
        ),
      },
    })
})

sync.get('/pull', requireAccess(true), async (c) => {
  const after = parseCursor(c.req.query('after') ?? '0')
  if (after === null) return c.json({ error: 'Invalid cursor' }, 400)
  if (c.req.header('X-Famo-Web-Protocol') && c.env.ASSETS) {
    try {
      const build = await c.env.ASSETS.fetch(
        new URL('/famo-web-build.txt', c.req.url),
      )
      const id = build.ok ? (await build.text()).trim() : ''
      if (/^[a-f0-9]{64}$/.test(id)) c.header('X-Famo-Web-Build', id)
    } catch {
      // A missing build ID should not interrupt sync.
    }
  }
  return c.json(await pull(c.env.DB, c.get('accountID'), after))
})

sync.post(
  '/push',
  requireAccess(true),
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => c.json({ error: 'Task is too large to sync' }, 413),
  }),
  async (c) => {
    if (!isJSONContentType(c.req.header('Content-Type'))) {
      return c.json({ error: 'Expected application/json' }, 415)
    }
    const operation = parseOperation(
      await c.req.json<unknown>().catch(() => null),
    )
    if (!operation) return c.json({ error: 'Invalid operation' }, 400)
    if (taskTooLarge(operation)) {
      return c.json({ error: 'Task is too large to sync' }, 413)
    }
    const result = await push(c.env.DB, c.get('accountID'), operation)
    if (result.status === 200)
      publish(c, { type: 'tasks', sequence: result.body.change.sequence })
    return c.json(result.body, result.status)
  },
)

sync.post(
  '/push-batch',
  requireAccess(true),
  bodyLimit({
    maxSize: MAX_BATCH_BYTES,
    onError: (c) => c.json({ error: 'Batch is too large to sync' }, 413),
  }),
  async (c) => {
    if (!isJSONContentType(c.req.header('Content-Type'))) {
      return c.json({ error: 'Expected application/json' }, 415)
    }
    const operations = parseOperations(
      await c.req.json<unknown>().catch(() => null),
    )
    if (!operations) return c.json({ error: 'Invalid operations' }, 400)
    if (operations.some(taskTooLarge)) {
      return c.json({ error: 'Task is too large to sync' }, 413)
    }
    const result = await pushBatch(c.env.DB, c.get('accountID'), operations)
    if (result.status === 200) {
      const sequence = Math.max(
        ...result.body.changes.map((change) => change.sequence),
      )
      publish(c, { type: 'tasks', sequence })
    }
    return c.json(result.body, result.status)
  },
)

sync.get('/collections', requireAccess(true), async (c) => {
  return c.json(await getCollections(c.env.DB, c.get('accountID')))
})

sync.post(
  '/collections',
  requireAccess(true),
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: 'Collections are too large to sync' }, 413),
  }),
  async (c) => {
    if (!isJSONContentType(c.req.header('Content-Type'))) {
      return c.json({ error: 'Expected application/json' }, 415)
    }
    const operation = parseCollectionsOperation(
      await c.req.json<unknown>().catch(() => null),
    )
    if (!operation) return c.json({ error: 'Invalid collections' }, 400)
    const result = await pushCollections(
      c.env.DB,
      c.get('accountID'),
      operation,
    )
    if (result.status === 200)
      publish(c, { type: 'collections', version: result.body.version })
    return c.json(result.body, result.status)
  },
)

function isJSONContentType(contentType: string | undefined): boolean {
  return (
    contentType?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
  )
}

function taskTooLarge({ task }: Operation): boolean {
  return new TextEncoder().encode(JSON.stringify(task)).length > 1536 * 1024
}

sync.all('*', requireAccess(false), (c) => c.json({ error: 'Not found' }, 404))

const app = new Hono<Env>()
app.route('/api/sync', sync)
app.all('/api/*', requireAccess(false), (c) =>
  c.json({ error: 'Not found' }, 404),
)
app.get('*', requireAccess(false), async (c) => {
  if (!c.env.ASSETS) return c.notFound()
  const asset = await c.env.ASSETS.fetch(c.req.raw)
  const response = new Response(asset.body, asset)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
})
app.onError((error, c) => {
  // Avoid logging task content or credentials from opaque platform errors.
  console.error('Famo sync request failed', error.name)
  return c.json({ error: 'Sync request failed' }, 500)
})

export default app
