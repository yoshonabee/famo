import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { MiddlewareHandler } from 'hono'
import { authorize } from './access'
import type { AccessBindings } from './access'
import { parseCursor, parseOperation } from './protocol'
import { pull, push } from './store'

type Env = {
  Bindings: AccessBindings & { DB: D1Database; ASSETS?: Fetcher }
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

sync.get('/pull', requireAccess(true), async (c) => {
  const after = parseCursor(c.req.query('after') ?? '0')
  if (after === null) return c.json({ error: 'Invalid cursor' }, 400)
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
    if (
      c.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
      'application/json'
    ) {
      return c.json({ error: 'Expected application/json' }, 415)
    }
    const operation = parseOperation(
      await c.req.json<unknown>().catch(() => null),
    )
    if (!operation) return c.json({ error: 'Invalid operation' }, 400)
    if (
      new TextEncoder().encode(JSON.stringify(operation.task)).length >
      1536 * 1024
    ) {
      return c.json({ error: 'Task is too large to sync' }, 413)
    }
    const result = await push(c.env.DB, c.get('accountID'), operation)
    return c.json(result.body, result.status)
  },
)

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
