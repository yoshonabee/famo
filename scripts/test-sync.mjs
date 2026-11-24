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
  let dropCollectionsResponse = true
  const pushes = []
  const collectionPushes = []
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
      const taskPush = isPush && req.url === '/api/sync/push'
      const collectionsPush = isPush && req.url === '/api/sync/collections'
      if (taskPush) pushes.push(JSON.parse(body))
      if (collectionsPush) collectionPushes.push(JSON.parse(body))
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
      if (taskPush && upstream.status === 409) conflicts++
      if (
        upstream.ok &&
        ((dropResponse && taskPush) ||
          (dropCollectionsResponse && collectionsPush))
      ) {
        if (taskPush) dropResponse = false
        if (collectionsPush) dropCollectionsResponse = false
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
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const phoneNotifications = []
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).pathname !== '/api/sync/events') return
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string' && payload !== 'pong')
        phoneNotifications.push(JSON.parse(payload))
    })
  })
  await page.goto(worker)
  online = true
  const titleButton = (title) =>
    page.getByRole('button', { name: new RegExp(title) })
  const openCapture = () =>
    page.getByRole('button', { name: '快速新增任務', exact: true }).tap()
  const capture = page.getByRole('dialog', { name: '快速新增任務' })
  const captureTitle = capture.getByRole('textbox', {
    name: '快速新增任務名稱',
  })
  const addTask = capture.getByRole('button', {
    name: '新增這一列',
    exact: true,
  })
  const closeCapture = () =>
    capture.getByRole('button', { name: '關閉', exact: true }).tap()
  const switchBoard = () =>
    page.getByRole('button', { name: /^切換 Board：/ }).tap()
  const openProjects = () =>
    page
      .getByRole('navigation', { name: '主要導覽' })
      .getByRole('button', { name: 'Projects', exact: true })
      .tap()
  const openBoards = () =>
    page
      .getByRole('navigation', { name: '主要導覽' })
      .getByRole('button', { name: 'Boards', exact: true })
      .tap()
  const listDesktopTasks = () => get(`${desktop}/api/tasks`)
  await titleButton(task.title).waitFor({ timeout: 25_000 })
  await eventually('a task notification over the phone WebSocket', () =>
    phoneNotifications.some(
      ({ type, sequence }) => type === 'tasks' && sequence === 1,
    ),
  )
  await switchBoard()
  await page.getByRole('button', { name: '今日', exact: true }).tap()
  await eventually(
    'an idempotent retry after the dropped response',
    () => pushes.length >= 2,
  )
  assert.deepEqual(pushes[0], pushes[1])
  assert.equal((await pull()).changes.length, 1)

  const complete = page.getByRole('checkbox', {
    name: `完成任務：${task.title}`,
    exact: true,
  })
  const reopen = page.getByRole('checkbox', {
    name: `恢復任務：${task.title}`,
    exact: true,
  })
  await complete.click()
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
  await reopen.click()
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
  await openCapture()
  await captureTitle.fill(phoneTitle)
  await addTask.tap()
  await closeCapture()
  const phoneTask = await eventually('phone creation on desktop', async () =>
    (await get(`${desktop}/api/tasks`)).find(
      (entry) => entry.title === phoneTitle,
    ),
  )
  await post(`${desktop}/api/tasks/${phoneTask.id}/actions`, {
    op: 'delete_item',
    version: phoneTask.version,
  })
  await titleButton(phoneTitle).waitFor({ state: 'hidden', timeout: 25_000 })
  assert((await pull()).changes.at(-1).task.deleted_at)

  const collections = () => get(`${worker}/api/sync/collections`, { headers })
  const deskProject = (id) =>
    get(`${desktop}/api/projects`).then((projects) =>
      projects.find((project) => project.id === id),
    )
  const deskBoard = (id) =>
    get(`${desktop}/api/boards`).then((boards) =>
      boards.find((board) => board.id === id),
    )
  online = false
  const workspace = join(temp, 'local-errands-workspace')
  await mkdir(workspace)
  const errands = await post(`${desktop}/api/projects`, {
    name: 'Errands',
    color: '#527844',
    workspace_dir: workspace,
    workspace_prompt: 'Private local instructions',
  })
  const home = await post(`${desktop}/api/projects`, {
    name: 'Home',
    color: '#64748B',
  })
  await post(`${desktop}/api/projects/reorder`, {
    project_ids: [home.id, errands.id],
  })
  const weekend = await post(`${desktop}/api/boards`, {
    name: 'Weekend',
    icon: 'house',
    project_ids: [errands.id],
  })
  await post(`${desktop}/api/tasks/${task.id}/actions`, {
    op: 'update',
    version: (await get(`${desktop}/api/tasks/${task.id}`)).version,
    project_id: errands.id,
  })
  assert.equal((await collections()).version, 0)
  await stop(desktopProcess)
  desktopProcess = await launchDesktop()
  online = true
  await eventually(
    'the same metadata operation retried after a dropped response',
    () => collectionPushes.length >= 2,
  )
  assert.deepEqual(collectionPushes[0], collectionPushes[1])
  assert.deepEqual(
    Object.keys(
      collectionPushes[0].projects.find(({ id }) => id === errands.id),
    ).sort(),
    ['color', 'id', 'name', 'position'],
  )
  const initial = await collections()
  assert.equal(initial.version, 1)
  assert.deepEqual(
    initial.projects.find(({ id }) => id === errands.id),
    {
      id: errands.id,
      name: 'Errands',
      color: '#527844',
      position: 1,
    },
  )
  assert.deepEqual(initial.boards, [
    {
      id: weekend.id,
      name: 'Weekend',
      icon: 'house',
      project_ids: [errands.id],
    },
  ])
  const refresh = () =>
    page.getByRole('button', { name: '同步', exact: true }).click()
  await refresh()
  await switchBoard()
  await page.getByRole('button', { name: weekend.name, exact: true }).tap()
  await complete.waitFor({ timeout: 25_000 })
  await openProjects()
  const editProject = (name) =>
    page
      .getByRole('button', { name: `編輯 Project：${name}`, exact: true })
      .click()
  const editBoard = (name) =>
    page
      .getByRole('button', { name: `編輯 Board：${name}`, exact: true })
      .click()
  const save = () =>
    page.getByRole('button', { name: '儲存', exact: true }).click()
  await editProject('Errands')
  await page.getByLabel('Project 名稱', { exact: true }).fill('Out and about')
  await page.getByRole('radio', { name: '海藍', exact: true }).check()
  await save()
  await eventually('mobile Project rename on desktop', async () => {
    const project = await deskProject(errands.id)
    if (project?.name !== 'Out and about') return false
    assert.equal(project.color, '#4F87CC')
    assert.equal(project.workspace_dir, errands.workspace_dir)
    assert.equal(project.workspace_prompt, errands.workspace_prompt)
    return true
  })

  online = false
  const localBoard = await deskBoard(weekend.id)
  await post(`${desktop}/api/boards/${weekend.id}`, {
    name: 'Offline weekend',
    icon: localBoard.icon,
    project_ids: localBoard.project_ids,
    version: localBoard.version,
  })
  await openBoards()
  await switchBoard()
  await editBoard('Weekend')
  await page.getByLabel('Board 名稱', { exact: true }).fill('Weekend plans')
  await page.getByRole('button', { name: /^Board 圖示/ }).click()
  await page.getByRole('option', { name: '公事包', exact: true }).click()
  await page.getByRole('checkbox', { name: home.name, exact: true }).check()
  await save()
  await eventually('mobile Board update on Worker', async () =>
    (await collections()).boards.some(
      (entry) => entry.name === 'Weekend plans',
    ),
  )
  online = true
  const collectionConflict = await eventually(
    'a recorded collection conflict with both revisions',
    () => status().collections?.conflict,
  )
  assert.equal(collectionConflict.local.boards[0].name, 'Offline weekend')
  assert.equal(collectionConflict.remote.boards[0].name, 'Weekend plans')
  run(binary, [
    'sync',
    'resolve-collections',
    '-db',
    join(temp, 'desktop.db'),
    '-choice',
    'remote',
    '-local-token',
    collectionConflict.local_token,
    '-remote-version',
    String(collectionConflict.remote.version),
  ])
  await eventually('resolved Board on desktop', async () => {
    const board = await deskBoard(weekend.id)
    if (board?.name !== 'Weekend plans') return false
    assert.deepEqual(
      [...board.project_ids].sort(),
      [errands.id, home.id].sort(),
    )
    return true
  })

  await openProjects()
  await editProject('Out and about')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '刪除', exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '永久刪除', exact: true })
    .click()
  await eventually(
    'Project removal and Task/Board unlink on desktop',
    async () => {
      const board = await deskBoard(weekend.id)
      const bike = await get(`${desktop}/api/tasks/${task.id}`)
      return (
        !(await deskProject(errands.id)) &&
        board?.project_ids.join() === home.id &&
        !bike.project_id
      )
    },
  )

  // Capture two tasks from the same Board and reschedule only one on the phone.
  await openBoards()
  await page
    .getByRole('button', { name: '切換 Board：Weekend plans' })
    .waitFor()
  await openCapture()
  const captureProject = capture.getByRole('button', { name: '任務 Project' })
  await captureProject.tap()
  await capture.getByRole('option', { name: home.name, exact: true }).tap()
  await captureTitle.fill('Return the library books')
  await captureTitle.press('Enter')
  await captureTitle.fill('Pick up groceries')
  await addTask.tap()
  await closeCapture()
  const taskTitles = ['Return the library books', 'Pick up groceries']
  await eventually(
    'consecutive phone capture with Board defaults',
    async () => {
      const entries = (await listDesktopTasks()).filter(({ title }) =>
        taskTitles.includes(title),
      )
      return (
        entries.length === 2 &&
        entries.every(
          (entry) =>
            entry.project_id === home.id && entry.scheduled_date === dateString,
        )
      )
    },
  )
  await titleButton(taskTitles[0]).waitFor()
  await titleButton(taskTitles[1]).waitFor()

  const screenshot = process.argv[2]
  if (screenshot) {
    const output = resolve(screenshot)
    await mkdir(dirname(output), { recursive: true })
    await page.locator('[data-sync-status="synced"]').waitFor()
    await page.screenshot({ path: output })
  }

  await titleButton(taskTitles[0]).tap()
  const detail = page.getByRole('dialog', { name: taskTitles[0] })
  await detail.getByRole('button', { name: /^任務日期/ }).tap()
  const tomorrow = new Date(date)
  tomorrow.setDate(date.getDate() + 1)
  const nextDate = [
    tomorrow.getFullYear(),
    tomorrow.getMonth() + 1,
    tomorrow.getDate(),
  ]
    .map((part) => String(part).padStart(2, '0'))
    .join('-')
  const day = detail.locator(`button[data-date="${nextDate}"]`)
  if (tomorrow.getMonth() !== date.getMonth()) {
    await detail.getByRole('button', { name: '下一個月' }).tap()
  }
  await day.tap()
  await eventually(
    'phone date change on desktop without mutating the second task',
    async () => {
      const entries = await listDesktopTasks()
      const [first, second] = taskTitles.map((title) =>
        entries.find((entry) => entry.title === title),
      )
      return (
        first?.scheduled_date === nextDate &&
        second?.scheduled_date === dateString &&
        first.project_id === home.id &&
        second.project_id === home.id
      )
    },
  )
  await detail.getByRole('button', { name: '清除日期', exact: true }).tap()
  await eventually('phone date clear on desktop', async () => {
    const entries = await listDesktopTasks()
    return (
      entries.find(({ title }) => title === taskTitles[0])?.scheduled_date ===
      ''
    )
  })

  console.log(
    'Passed task and collection sync, offline restarts, duplicate receipts, bidirectional edits, conflicts, deletion, and consecutive mobile capture with date changes.',
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
