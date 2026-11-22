import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { build } from 'esbuild'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { convertV4MiniflareOptions, Miniflare, Response } from 'miniflare'

const fixture = JSON.parse(
  await readFile(new URL('../protocol-v1.json', import.meta.url), 'utf8'),
)
const migration = await readFile(
  new URL('../migrations/0001_sync.sql', import.meta.url),
  'utf8',
)
const {
  outputFiles: [{ text: script }],
} = await build({
  entryPoints: [new URL('../src/index.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  write: false,
})

const localOrigin = 'http://localhost'
const localToken = 'test-local-token'

async function start(t, options = {}) {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      script,
      modules: true,
      compatibilityDate: '2026-11-01',
      d1Databases: { DB: 'famo-test' },
      serviceBindings: { ASSETS: () => new Response('Mobile Famo') },
      ...options,
    }),
  )
  t.after(() => worker.dispose())
  const db = await worker.getD1Database('DB')
  await db.batch(
    migration
      .trim()
      .split(/\n\n+/)
      .map((statement) => db.prepare(statement)),
  )
  return { worker, db }
}

function request(
  worker,
  path,
  { origin = localOrigin, operation, headers, local = true } = {},
) {
  return worker.dispatchFetch(new URL(path, origin), {
    method: operation ? 'POST' : 'GET',
    body: operation ? JSON.stringify(operation) : undefined,
    headers: {
      ...(local ? { Authorization: `Bearer ${localToken}` } : {}),
      ...(operation ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  })
}

async function expectJSON(response, status, body) {
  assert.equal(response.status, status)
  assert.deepEqual(await response.json(), body)
}

test('the shared fixture records only successful writes and keeps original duplicate receipts', async (t) => {
  const { worker } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const commit = (operation) => request(worker, '/api/sync/push', { operation })
  const pull = (after) => request(worker, `/api/sync/pull?after=${after}`)

  await expectJSON(await commit(fixture.create), 200, {
    change: fixture.changes[0],
  })
  await expectJSON(await commit(fixture.complete), 200, {
    change: fixture.changes[1],
  })
  await expectJSON(await commit(fixture.conflict), 409, {
    current: fixture.complete.task,
  })
  await expectJSON(await pull(2), 200, {
    changes: [],
    cursor: 2,
    has_more: false,
  })
  await expectJSON(await commit(fixture.delete), 200, {
    change: fixture.changes[2],
  })
  await expectJSON(await commit(fixture.create), 200, {
    change: fixture.changes[0],
  })

  const changedOperation = {
    ...fixture.create,
    task: { ...fixture.create.task, title: 'A different title' },
  }
  await expectJSON(await commit(changedOperation), 400, {
    error: 'Operation ID already used',
  })

  const response = await pull(0)
  assert.equal(response.headers.get('X-Famo-Sync-Account'), 'personal')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  await expectJSON(response, 200, {
    changes: fixture.changes,
    cursor: 3,
    has_more: false,
  })
  await expectJSON(await pull(2), 200, {
    changes: [fixture.changes[2]],
    cursor: 3,
    has_more: false,
  })
})

test('concurrent edits against the same version serialize to one new change', async (t) => {
  const { worker, db } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const commit = (operation) => request(worker, '/api/sync/push', { operation })
  await expectJSON(await commit(fixture.create), 200, {
    change: fixture.changes[0],
  })
  const both = await Promise.all([
    commit(fixture.complete),
    commit(fixture.conflict),
  ])
  const [winner, loser] = both.sort((a, b) => a.status - b.status)
  assert.equal(winner.status, 200)
  assert.equal(loser.status, 409)
  const { change } = await winner.json()
  assert.equal(change.sequence, 2)
  assert.deepEqual(await loser.json(), { current: change.task })
  assert.equal(
    await db.prepare('SELECT count(*) FROM sync_changes').first('count(*)'),
    2,
  )

  const lostOperation = change.task.completed_at
    ? fixture.conflict
    : fixture.complete
  const rebased = {
    ...lostOperation,
    base_version: 2,
    task: { ...lostOperation.task, version: 3 },
  }
  await expectJSON(await commit(rebased), 200, {
    change: { sequence: 3, task: rebased.task },
  })
})

test('pull cursor resumes across pages and skips changes from other accounts', async (t) => {
  const { worker, db } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const statement = db.prepare(`
    INSERT INTO sync_changes (account_id, operation_id, task_id, version, document)
    VALUES (?, ?, ?, 1, ?)
  `)
  const description = 'x'.repeat(1024 * 1024)
  await db.batch(
    Array.from({ length: 5 }, (_, index) => {
      const id = `task-${index}`
      const account = index === 1 ? 'other' : 'personal'
      return statement.bind(
        account,
        `op-${index}`,
        id,
        JSON.stringify({ ...fixture.create.task, id, description }),
      )
    }),
  )

  const first = await request(worker, '/api/sync/pull')
  assert.equal(first.status, 200)
  const data = await first.json()
  assert.deepEqual(
    data.changes.map(({ sequence }) => sequence),
    [1, 3, 4],
  )
  assert.equal(data.cursor, 4)
  assert.equal(data.has_more, true)

  const response = await request(worker, `/api/sync/pull?after=${data.cursor}`)
  await expectJSON(response, 200, {
    changes: [
      {
        sequence: 5,
        task: { ...fixture.create.task, id: 'task-4', description },
      },
    ],
    cursor: 5,
    has_more: false,
  })
})

test('local mode accepts bearer or same-origin browser requests on loopback only', async (t) => {
  const { worker, db } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const attempts = [
    { headers: { Authorization: 'Bearer wrong' } },
    { headers: { 'X-Famo-Sync-Account': 'wrong' } },
    { origin: 'http://example.com' },
    {
      local: false,
      headers: {
        'Sec-Fetch-Site': 'same-origin',
        Origin: 'https://example.com',
      },
    },
    { local: false },
  ]

  for (const options of attempts) {
    const denied = await request(worker, '/api/sync/push', {
      operation: fixture.create,
      ...options,
    })
    assert.equal(denied.status, 403)
  }
  assert.equal(
    await db.prepare('SELECT count(*) FROM sync_changes').first('count(*)'),
    0,
  )

  const browser = {
    local: false,
    headers: { 'Sec-Fetch-Site': 'same-origin', Origin: localOrigin },
  }
  const response = await request(worker, '/api/sync/push', {
    ...browser,
    operation: fixture.create,
  })
  await expectJSON(response, 200, { change: fixture.changes[0] })
  assert.equal((await request(worker, '/api/sync/pull', browser)).status, 200)
  assert.equal(
    (await request(worker, '/api/sync/pull?after=1.2', browser)).status,
    400,
  )
})

test('Access JWTs authorize the configured browser and service identities', async (t) => {
  const origin = 'https://famo.example.com'
  const issuer = 'https://famo.cloudflareaccess.com'
  const audience = 'famo-access-aud'
  const email = 'owner@example.com'
  const clientID = 'famo-sync-client.access'
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    extractable: true,
  })
  const { privateKey: wrongKey } = await generateKeyPair('RS256')
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: 'access-key',
    alg: 'RS256',
  }
  const token = (
    claims,
    { key = privateKey, aud = audience, iss = issuer, expires = '5m' } = {},
  ) =>
    new SignJWT({ type: 'app', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuedAt()
      .setIssuer(iss)
      .setAudience([aud])
      .setExpirationTime(expires)
      .sign(key)

  const { worker } = await start(t, {
    bindings: {
      ACCESS_HOST: new URL(origin).hostname,
      ACCESS_ISSUER: issuer,
      ACCESS_AUDIENCE: audience,
      ACCESS_EMAIL: email,
      ACCESS_SERVICE_CLIENT_ID: clientID,
      ACCESS_ACCOUNT_ID: 'owner',
    },
    outboundService(request) {
      assert.equal(request.url, `${issuer}/cdn-cgi/access/certs`)
      return Response.json({ keys: [jwk] })
    },
  })

  const hit = (path, jwt, options = {}) =>
    request(worker, path, {
      local: false,
      origin,
      ...options,
      headers: {
        ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}),
        ...options.headers,
      },
    })

  const browser = await token({ email })
  const service = await token({ common_name: clientID })
  assert.equal(await (await hit('/', browser)).text(), 'Mobile Famo')
  assert.equal((await hit('/', service)).status, 403)
  assert.equal((await hit('/api/desktop/preferences', browser)).status, 404)
  assert.equal(
    (
      await hit('/api/sync/pull', browser, {
        origin: 'https://famo.workers.dev',
      })
    ).status,
    403,
  )

  for (const denied of [
    undefined,
    await token({ email: 'someone@example.com' }),
    await token({ email }, { aud: 'another-app' }),
    await token({ email }, { iss: 'https://another.cloudflareaccess.com' }),
    await token({ email }, { expires: '1s ago' }),
    await token({ email }, { key: wrongKey }),
    await token({ email, type: 'org' }),
    await token({ common_name: 'another-client.access' }),
  ]) {
    assert.equal((await hit('/api/sync/pull', denied)).status, 403)
  }

  const create = await hit('/api/sync/push', service, {
    operation: fixture.create,
    headers: { 'X-Famo-Sync-Account': 'owner' },
  })
  await expectJSON(create, 200, { change: fixture.changes[0] })
  const complete = await hit('/api/sync/push', browser, {
    operation: fixture.complete,
    headers: { Origin: origin },
  })
  await expectJSON(complete, 200, { change: fixture.changes[1] })
  const conflict = await hit('/api/sync/push', service, {
    operation: fixture.conflict,
  })
  assert.equal(conflict.headers.get('X-Famo-Sync-Account'), 'owner')
  await expectJSON(conflict, 409, { current: fixture.complete.task })
})
