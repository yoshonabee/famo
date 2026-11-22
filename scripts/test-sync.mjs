import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(join(root, 'web/package.json'))
const { chromium } = require('@playwright/test')
const temp = await mkdtemp(join(tmpdir(), 'famo-sync-e2e-'))
const sync = join(root, 'sync')
const wrangler = join(sync, 'node_modules/.bin/wrangler')
const token = randomBytes(24).toString('hex')
const headers = { Authorization: `Bearer ${token}` }
const local = (port) => `http://127.0.0.1:${port}`
const processes = []
let browser
let proxy
let failure

async function listen(server) {
  await new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', done)
  })
  return server.address().port
}

async function freePort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise((done) => server.close(done))
  return port
}

function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

function start(command, args, options = {}) {
  const proc = spawn(command, args, { cwd: root, detached: true, ...options })
  const output = { proc, log: '', status: null }
  processes.push(output)
  for (const stream of [proc.stderr, proc.stdout]) {
    stream.on('data', (chunk) => {
      output.log = (output.log + chunk).slice(-10_000)
    })
  }
  proc.on('error', (error) => {
    output.log += String(error)
  })
  output.closed = new Promise((done) => {
    proc.once('close', (code, signal) => {
      output.status = code ?? signal
      done()
    })
  })
  return output
}

function signal(proc, sig) {
  if (!proc.pid) return
  try {
    process.kill(-proc.pid, sig)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

async function stop(proc) {
  if (proc.status === null) {
    signal(proc.proc, 'SIGTERM')
    await Promise.race([proc.closed, delay(1500, undefined, { ref: false })])
  }
  if (proc.status === null) {
    signal(proc.proc, 'SIGKILL')
    await proc.closed
  }
}

async function eventually(label, predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout
  let lastError
  do {
    try {
      const value = await predicate()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(150)
  } while (Date.now() < deadline)
  throw new Error(`Timed out waiting for ${label}`, { cause: lastError })
}

async function get(url, init = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(3000),
    ...init,
  })
  assert(response.ok, `GET ${url} returned HTTP ${response.status}`)
  return response.json()
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  })
  assert(
    response.ok,
    `POST ${url} returned HTTP ${response.status}: ${await response.clone().text()}`,
  )
  return response.json()
}

try {
  run('npm', ['run', 'build:sync'], join(root, 'web'))
  const state = join(temp, 'worker')
  const config = 'wrangler.dev.jsonc'
  run(
    wrangler,
    [
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--config',
      config,
      '--persist-to',
      state,
    ],
    sync,
  )
  const workerPort = await freePort()
  const desktopPort = await freePort()
  const worker = local(workerPort)
  const desktop = local(desktopPort)
  start(
    wrangler,
    [
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(workerPort),
      '--config',
      config,
      '--persist-to',
      state,
      '--var',
      `LOCAL_SYNC_TOKEN:${token}`,
    ],
    { cwd: sync },
  )
  const pull = () => get(`${worker}/api/sync/pull?after=0`, { headers })
  await eventually('the local Worker', pull, 30_000)

  let online = false
  let dropResponse = true
  const pushes = []
  let conflicts = 0
  proxy = createServer(async (req, res) => {
    if (!online) {
      res.writeHead(503).end()
      return
    }
    try {
      const parts = []
      for await (const part of req) parts.push(part)
      const body = Buffer.concat(parts)
      const isPush = req.method === 'POST'
      if (isPush) pushes.push(JSON.parse(body))
      const upstream = await fetch(new URL(req.url, worker), {
        method: req.method,
        headers: {
          Authorization: req.headers.authorization ?? '',
          'X-Famo-Sync-Account': req.headers['x-famo-sync-account'] ?? '',
          'Content-Type': 'application/json',
        },
        body: isPush ? body : undefined,
        signal: AbortSignal.timeout(3000),
      })
      if (upstream.status === 409) conflicts++
      if (dropResponse && isPush && upstream.ok) {
        dropResponse = false
        await upstream.arrayBuffer()
        res.destroy()
        return
      }
      const account = upstream.headers.get('X-Famo-Sync-Account')
      if (account) res.setHeader('X-Famo-Sync-Account', account)
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
      res.end(Buffer.from(await upstream.arrayBuffer()))
    } catch (error) {
      res.writeHead(502).end(String(error))
    }
  })
  const proxyPort = await listen(proxy)
  const desktopConfig = join(temp, 'famo-sync.json')
  await writeFile(
    desktopConfig,
    JSON.stringify({
      url: local(proxyPort),
      account: 'personal',
      interval_seconds: 1,
    }),
  )
  const binary = join(temp, 'famo')
  run('go', ['build', '-o', binary, './cmd/famo'])
  const launchDesktop = async () => {
    const child = start(
      binary,
      [
        '-db',
        join(temp, 'desktop.db'),
        '-addr',
        `127.0.0.1:${desktopPort}`,
        '-sync-config',
        desktopConfig,
      ],
      { env: { ...process.env, FAMO_SYNC_LOCAL_TOKEN: token } },
    )
    await eventually('desktop HTTP API', () => get(`${desktop}/api/health`))
    return child
  }
  let desktopProcess = await launchDesktop()
  const date = new Date()
  const dateString = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-')
  const task = await post(`${desktop}/api/tasks`, {
    title: 'Pick up the repaired bike',
    scheduled_date: dateString,
    description: 'Bring the receipt',
    links: [{ url: 'https://example.com/receipt' }],
  })
  assert.deepEqual((await pull()).changes, [])
  await stop(desktopProcess)
  desktopProcess = await launchDesktop()

  browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await page.goto(worker)
  online = true
  await page.getByText(task.title, { exact: true }).waitFor({ timeout: 25_000 })
  await eventually(
    'an idempotent retry after the dropped response',
    () => pushes.length >= 2,
  )
  assert.deepEqual(pushes[0], pushes[1])
  assert.equal((await pull()).changes.length, 1)

  const checkbox = page.getByRole('checkbox', { name: task.title, exact: true })
  await checkbox.click()
  await eventually('phone completion on desktop', async () => {
    const remote = await get(`${desktop}/api/tasks/${task.id}`)
    if (!remote.completed_at) return false
    assert.equal(remote.description, task.description)
    assert.deepEqual(remote.links, task.links)
    return true
  })
  const afterComplete = (await pull()).changes
  assert.equal(afterComplete.length, 2)

  online = false
  await post(`${desktop}/api/tasks/${task.id}/actions`, {
    op: 'rename',
    version: 2,
    title: 'Desktop edited while offline',
  })
  await checkbox.click()
  await eventually(
    'phone reopen',
    async () => (await pull()).changes.length === 3,
  )
  online = true
  await eventually(
    'a version conflict on the desktop push',
    () => conflicts > 0,
  )
  const status = () =>
    JSON.parse(
      execFileSync(
        binary,
        ['sync', 'status', '-db', join(temp, 'desktop.db')],
        { encoding: 'utf8' },
      ),
    )
  const conflict = await eventually(
    'a recorded conflict with both versions',
    () => status().conflicts.find((entry) => entry.task_id === task.id),
  )
  const afterConflict = (await pull()).changes
  assert.equal(afterConflict.length, 3)
  assert.equal(afterConflict.at(-1).task.title, task.title)
  assert.equal(
    (await get(`${desktop}/api/tasks/${task.id}`)).title,
    'Desktop edited while offline',
  )

  run(binary, [
    'sync',
    'resolve',
    '-db',
    join(temp, 'desktop.db'),
    '-choice',
    'remote',
    '-local-version',
    String(conflict.local.version),
    '-remote-version',
    String(conflict.remote.version),
    task.id,
  ])
  await eventually(
    'the resolved server version on desktop',
    async () =>
      (await get(`${desktop}/api/tasks/${task.id}`)).title === task.title,
  )

  const phoneTitle = 'Plan next week'
  await page.getByRole('textbox', { name: '新增任務' }).fill(phoneTitle)
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const phoneTask = await eventually('phone creation on desktop', async () =>
    (await get(`${desktop}/api/tasks`)).find(
      (entry) => entry.title === phoneTitle,
    ),
  )
  const screenshot = process.argv[2]
  if (screenshot) {
    await page
      .getByText(phoneTitle, { exact: true })
      .waitFor({ timeout: 25_000 })
    const output = resolve(screenshot)
    await mkdir(dirname(output), { recursive: true })
    await page.screenshot({ path: output })
  }
  await post(`${desktop}/api/tasks/${phoneTask.id}/actions`, {
    op: 'delete_item',
    version: phoneTask.version,
  })
  await page
    .getByText(phoneTitle, { exact: true })
    .waitFor({ state: 'hidden', timeout: 25_000 })
  assert((await pull()).changes.at(-1).task.deleted_at)

  console.log(
    'Passed offline restart, idempotent retry, mobile creation and completion, conflict resolution, and deletion.',
  )
} catch (error) {
  failure = error
  for (const { log } of processes) {
    if (log) console.error(log.replaceAll(token, '[redacted]'))
  }
} finally {
  await browser?.close()
  proxy?.closeAllConnections()
  proxy?.close()
  await Promise.all(processes.map(stop))
  await rm(temp, { recursive: true, force: true })
}
if (failure) throw failure
