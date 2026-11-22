import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { build } from 'esbuild'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { convertV4MiniflareOptions, Miniflare, Response } from 'miniflare'

const fixture = JSON.parse(
  await readFile(new URL('../protocol-v1.json', import.meta.url), 'utf8'),
)
const migrations = await Promise.all(
  ['0001_sync.sql', '0002_collections.sql'].map((file) =>
    readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'),
  ),
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
      serviceBindings: {
        ASSETS: (request) => {
          switch (new URL(request.url).pathname) {
            case '/':
              return new Response('<title>Famo</title>', {
                headers: { 'Content-Type': 'text/html' },
              })
            case '/assets/app.js':
              return new Response('export {}', {
                headers: { 'Content-Type': 'text/javascript' },
              })
            default:
              return new Response(null, { status: 404 })
          }
        },
      },
      ...options,
    }),
  )
  t.after(() => worker.dispose())
  const db = await worker.getD1Database('DB')
  await db.batch(
    migrations.flatMap((migration) =>
      migration
        .trim()
        .split(/\n\n+/)
        .map((statement) => db.prepare(statement)),
    ),
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

function taskOperation(id, baseVersion, patch = {}) {
  return {
    operation_id: `op-${id}-${baseVersion}`,
    task_id: id,
    base_version: baseVersion,
    task: { ...fixture.create.task, id, version: baseVersion + 1, ...patch },
  }
}

test('task batches apply atomically and replay original receipts in request order', async (t) => {
  const { worker } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const batch = (operations) =>
    request(worker, '/api/sync/push-batch', { operation: { operations } })
  const first = taskOperation('task-z', 0, { description: '測試 "\\ \n' })
  const second = taskOperation('task-a', 0)
  const initial = [
    { sequence: 1, task: first.task },
    { sequence: 2, task: second.task },
  ]
  await expectJSON(await batch([first, second]), 200, { changes: initial })
  await expectJSON(
    await request(worker, '/api/sync/push', { operation: first }),
    200,
    { change: initial[0] },
  )

  const updateFirst = taskOperation(first.task_id, 1, {
    project_id: 'project',
  })
  const staleSecond = { ...second, operation_id: 'stale' }
  await expectJSON(await batch([updateFirst, staleSecond]), 409, {
    error: 'Version conflict',
  })
  await expectJSON(await batch([updateFirst, second]), 409, {
    error: 'Version conflict',
  })
  await expectJSON(await request(worker, '/api/sync/pull?after=2'), 200, {
    changes: [],
    cursor: 2,
    has_more: false,
  })

  const updateSecond = taskOperation(second.task_id, 1, {
    project_id: 'project',
  })
  const updates = [updateFirst, updateSecond]
  const changes = updates.map(({ task }, i) => ({ sequence: 3 + i, task }))
  await expectJSON(await batch(updates), 200, { changes })
  await expectJSON(await batch([first, second]), 200, { changes: initial })
  await expectJSON(
    await batch([
      { ...first, task: { ...first.task, title: 'Different' } },
      second,
    ]),
    400,
    { error: 'Operation ID already used' },
  )
  await expectJSON(await request(worker, '/api/sync/pull?after=2'), 200, {
    changes,
    cursor: 4,
    has_more: false,
  })
})

test('overlapping concurrent batches commit one full set of changes', async (t) => {
  const { worker, db } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const batch = (operations) =>
    request(worker, '/api/sync/push-batch', { operation: { operations } })
  const [winner, loser] = (
    await Promise.all([
      batch([taskOperation('first', 0), taskOperation('shared', 0)]),
      batch([
        taskOperation('second', 0),
        {
          ...taskOperation('shared', 0),
          operation_id: 'another-operation',
        },
      ]),
    ])
  ).sort((a, b) => a.status - b.status)
  assert.equal(winner.status, 200)
  assert.equal((await winner.json()).changes.length, 2)
  await expectJSON(loser, 409, { error: 'Version conflict' })
  assert.equal(
    await db.prepare('SELECT count(*) FROM sync_changes').first('count(*)'),
    2,
  )
})

test('task batches allow large selections and enforce the D1 input limit', async (t) => {
  const { worker } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const path = '/api/sync/push-batch'
  const batch = (operations, options = {}) =>
    request(worker, path, { operation: { operations }, ...options })
  const first = taskOperation('task-1', 0)
  const second = taskOperation('task-2', 0)
  for (const operations of [
    [],
    [first, { ...first, operation_id: 'different-id' }],
    [first, { ...second, operation_id: first.operation_id }],
  ]) {
    await expectJSON(await batch(operations), 400, {
      error: 'Invalid operations',
    })
  }
  await expectJSON(await batch([first], { local: false }), 403, {
    error: 'Access denied',
  })
  const browser = {
    local: false,
    headers: { 'Sec-Fetch-Site': 'same-origin', Origin: localOrigin },
  }
  await expectJSON(
    await batch([first], {
      ...browser,
      headers: { ...browser.headers, Origin: 'http://other.test' },
    }),
    403,
    { error: 'Invalid origin' },
  )
  await expectJSON(
    await batch([
      taskOperation('large-1', 0, { description: 'x'.repeat(1_000_000) }),
      taskOperation('large-2', 0, { description: 'x'.repeat(1_000_000) }),
    ]),
    413,
    { error: 'Batch is too large to sync' },
  )
  const operations = Array.from({ length: 200 }, (_, i) =>
    taskOperation(`task-${i}`, 0),
  )
  const response = await batch(operations, browser)
  assert.equal(response.status, 200)
  assert.deepEqual(
    (await response.json()).changes.map(({ task }) => task.id),
    operations.map(({ task }) => task.id),
  )
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
  const page = await hit('/', browser)
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('Content-Type'), 'text/html')
  assert.equal(page.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(await page.text(), '<title>Famo</title>')
  const script = await hit('/assets/app.js', browser)
  assert.equal(script.status, 200)
  assert.equal(script.headers.get('Content-Type'), 'text/javascript')
  assert.equal(await script.text(), 'export {}')
  for (const path of ['/', '/assets/app.js']) {
    assert.equal((await hit(path, service)).status, 403)
    assert.equal((await hit(path, undefined)).status, 403)
  }
  assert.equal((await hit('/assets/missing.js', browser)).status, 404)
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

const emptyCollections = { version: 0, projects: [], boards: [] }

const home = { id: 'home', name: 'Home', color: '#4F9D69', position: 0 }
const work = { id: 'work', name: 'Work', color: '#E06464', position: null }
const personal = {
  id: 'personal',
  name: 'Personal',
  icon: 'house',
  project_ids: ['home', 'work'],
}
const collections = {
  operation_id: 'publish-collections',
  base_version: 0,
  projects: [home, work],
  boards: [personal],
}

test('collection snapshots canonicalize the shared fields and replay across later versions', async (t) => {
  const { worker, db } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const get = () => request(worker, '/api/sync/collections')
  const put = (operation) =>
    request(worker, '/api/sync/collections', { operation })

  const initial = await get()
  assert.equal(initial.headers.get('X-Famo-Sync-Account'), 'personal')
  assert.equal(initial.headers.get('Cache-Control'), 'no-store')
  await expectJSON(initial, 200, emptyCollections)

  const first = { version: 1, projects: [home, work], boards: [personal] }
  await expectJSON(
    await put({
      ...collections,
      projects: [
        work,
        {
          ...home,
          color: home.color.toLowerCase(),
          workspace_dir: '/mac/path',
          workspace_prompt: 'Private',
        },
      ],
      boards: [{ ...personal, project_ids: ['work', 'home'] }],
    }),
    200,
    first,
  )
  await expectJSON(await get(), 200, first)
  const { document } = await db
    .prepare('SELECT document FROM sync_collections WHERE account_id = ?')
    .bind('personal')
    .first()
  assert.deepEqual(JSON.parse(document), {
    projects: [home, work],
    boards: [personal],
  })

  // Removing a project and removing it from the associated board are one write.
  const removeProject = {
    ...collections,
    operation_id: 'remove-project',
    base_version: 1,
    projects: [home],
    boards: [{ ...personal, project_ids: ['home'] }],
  }
  const second = {
    version: 2,
    projects: removeProject.projects,
    boards: removeProject.boards,
  }
  await expectJSON(await put(removeProject), 200, second)
  await expectJSON(await put(collections), 200, first)
  await expectJSON(await get(), 200, second)
  await expectJSON(await put({ ...collections, base_version: 2 }), 400, {
    error: 'Operation ID already used',
  })
})

test('parallel collection writes have one winner and stay scoped to an account', async (t) => {
  const { worker, db } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  await db
    .prepare(
      `
    INSERT INTO sync_collections (account_id, version, operation_id, document)
    VALUES ('other', 50, 'publish-collections', '{"projects":[],"boards":[]}')
  `,
    )
    .run()
  const put = (operation) =>
    request(worker, '/api/sync/collections', { operation })
  const [winner, loser] = (
    await Promise.all([
      put(collections),
      put({ ...collections, operation_id: 'second-device', boards: [] }),
    ])
  ).sort((a, b) => a.status - b.status)
  assert.equal(winner.status, 200)
  const snapshot = await winner.json()
  assert.equal(snapshot.version, 1)
  await expectJSON(loser, 409, { current: snapshot })
  await expectJSON(
    await request(worker, '/api/sync/collections'),
    200,
    snapshot,
  )

  const task = await request(worker, '/api/sync/push', {
    operation: fixture.create,
  })
  await expectJSON(task, 200, { change: fixture.changes[0] })
  await expectJSON(await request(worker, '/api/sync/pull'), 200, {
    changes: [fixture.changes[0]],
    cursor: 1,
    has_more: false,
  })
})

test('collection writes reject invalid references and respect Access and same-origin checks', async (t) => {
  const { worker } = await start(t, {
    bindings: { LOCAL_SYNC_TOKEN: localToken },
  })
  const path = '/api/sync/collections'
  const put = (patch, options) =>
    request(worker, path, {
      operation: { ...collections, ...patch },
      ...options,
    })
  for (const patch of [
    { projects: [home] },
    { projects: [home, { ...work, name: 'HOME' }] },
    { projects: [home, home] },
    { projects: [home, { ...work, color: '#f01' }] },
    { projects: [home, { ...work, position: -1 }] },
    { boards: [personal, { ...personal, id: 'another', name: 'PERSONAL' }] },
    { boards: [{ ...personal, icon: 'other' }] },
    { boards: [{ ...personal, project_ids: ['home', 'home'] }] },
  ]) {
    await expectJSON(await put(patch), 400, { error: 'Invalid collections' })
  }

  assert.equal((await put({}, { local: false })).status, 403)
  assert.equal(
    (
      await put(
        {},
        {
          local: false,
          headers: {
            'Sec-Fetch-Site': 'same-origin',
            Origin: 'https://other.example',
          },
        },
      )
    ).status,
    403,
  )
  assert.equal(
    (await put({}, { headers: { 'X-Famo-Sync-Account': 'other' } })).status,
    403,
  )
  assert.equal((await request(worker, path, { local: false })).status, 403)
  assert.equal((await put({ padding: 'x'.repeat(1024 * 1024) })).status, 413)
  await expectJSON(await request(worker, path), 200, emptyCollections)
})
