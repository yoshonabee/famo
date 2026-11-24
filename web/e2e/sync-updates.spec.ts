import { expect, test, type WebSocketRoute } from '@playwright/test'
import type { Change, Operation } from '../src/lib/cloud-transport'

test('loads the startup history in one larger pull and defaults to smaller incremental pulls', async ({
  page,
}) => {
  let socket: WebSocketRoute | undefined
  const pulls: { after: number; limit: string | null }[] = []
  let count = 320
  await page.routeWebSocket('**/api/sync/events?protocol=1', (route) => {
    socket = route
  })
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: { version: 0, projects: [], boards: [] } }),
  )
  await page.route('**/api/sync/pull?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    const after = Number(query.get('after'))
    const limit = query.get('limit')
    pulls.push({ after, limit })
    const cursor = Math.min(after + Number(limit ?? 20), count)
    const changes = Array.from({ length: cursor - after }, (_, index) => {
      const sequence = after + index + 1
      return {
        sequence,
        task: {
          id: 'remote-task',
          title: `Remote version ${sequence}`,
          scheduled_date: '',
          description: '',
          completed_at: null,
          deleted_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          version: sequence,
          links: [],
        },
      }
    })
    return route.fulfill({
      json: { changes, cursor, has_more: cursor < count },
    })
  })

  await page.goto('/')
  await expect(page.getByText('Remote version 320')).toBeVisible()
  expect(pulls).toEqual([{ after: 0, limit: '1000' }])

  count++
  socket?.send(JSON.stringify({ type: 'tasks', sequence: count }))
  await expect(page.getByText('Remote version 321')).toBeVisible()
  expect(pulls).toEqual([
    { after: 0, limit: '1000' },
    { after: 320, limit: null },
  ])
})

test('keeps the background socket and catches up once when returning to the foreground', async ({
  page,
}) => {
  await page.clock.install()
  const sockets: WebSocketRoute[] = []
  const changes: Change[] = []
  let answerPing = true
  let pings = 0
  let pulls = 0
  await page.routeWebSocket('**/api/sync/events?protocol=1', (socket) => {
    sockets.push(socket)
    socket.onMessage((message) => {
      expect(message).toBe('ping')
      pings++
      if (answerPing) socket.send('pong')
    })
  })
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: { version: 0, projects: [], boards: [] } }),
  )
  await page.route('**/api/sync/pull?*', (route) => {
    pulls++
    const after = Number(
      new URL(route.request().url()).searchParams.get('after'),
    )
    const pending = changes.filter(({ sequence }) => sequence > after)
    return route.fulfill({
      json: {
        changes: pending,
        cursor: pending.at(-1)?.sequence ?? after,
        has_more: false,
      },
    })
  })

  function addRemoteTask(title: string) {
    const sequence = changes.length + 1
    changes.push({
      sequence,
      task: {
        id: `remote-${sequence}`,
        title,
        scheduled_date: '',
        description: '',
        completed_at: null,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        version: 1,
        links: [],
      },
    })
  }

  async function setHidden(hidden: boolean) {
    await page.evaluate((hidden) => {
      Object.defineProperties(document, {
        hidden: { configurable: true, value: hidden },
        visibilityState: {
          configurable: true,
          value: hidden ? 'hidden' : 'visible',
        },
      })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  }

  await page.goto('/')
  await expect.poll(() => sockets.length).toBe(1)
  await expect(
    page.getByRole('button', { name: '同步', exact: true }),
  ).toHaveAttribute('data-sync-status', 'synced')
  const initialPulls = pulls

  await setHidden(true)
  addRemoteTask('Background update')
  sockets[0].send(JSON.stringify({ type: 'tasks', sequence: 1 }))
  await page.clock.runFor(31_000)
  expect(pings).toBe(0)
  expect(pulls).toBe(initialPulls)

  await setHidden(false)
  await expect.poll(() => pings).toBe(1)
  await expect.poll(() => pulls).toBe(initialPulls + 1)
  await expect(page.getByText('Background update')).toBeVisible()
  expect(sockets).toHaveLength(1)

  await setHidden(true)
  addRemoteTask('Missed notification')
  answerPing = false
  await setHidden(false)
  await expect.poll(() => pings).toBe(2)
  expect(pulls).toBe(initialPulls + 1)

  await page.clock.runFor(7000)
  await expect.poll(() => sockets.length).toBe(2)
  await expect.poll(() => pulls).toBe(initialPulls + 2)
  await expect(page.getByText('Missed notification')).toBeVisible()
})

test('push refreshes the page data and version responses show the appropriate reload UI', async ({
  page,
}, testInfo) => {
  let send: WebSocketRoute['send'] | undefined
  let pulls = 0
  let update: 'none' | 'optional' | 'required' = 'none'
  await page.routeWebSocket('**/api/sync/events?protocol=1', (socket) => {
    send = (message) => socket.send(message)
  })
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: { version: 0, projects: [], boards: [] } }),
  )
  await page.route('**/api/sync/pull?*', (route) => {
    pulls++
    expect(route.request().headers()['x-famo-web-protocol']).toBe('1')
    if (update === 'required')
      return route.fulfill({
        status: 412,
        headers: { 'X-Famo-Web-Min-Protocol': '2' },
        json: { error: 'Reload Famo to continue syncing' },
      })
    return route.fulfill({
      headers:
        update === 'optional' ? { 'X-Famo-Web-Build': 'a'.repeat(64) } : {},
      json: { changes: [], cursor: 0, has_more: false },
    })
  })

  await page.goto('/')
  await expect.poll(() => Boolean(send)).toBe(true)
  await expect(
    page.getByRole('button', { name: '同步', exact: true }),
  ).toHaveAttribute('data-sync-status', 'synced')
  const initialPulls = pulls
  update = 'optional'
  send?.(JSON.stringify({ type: 'tasks', sequence: 1 }))
  await expect(
    page.getByRole('status').filter({ hasText: 'Famo 有新版' }),
  ).toBeVisible()
  expect(pulls).toBeGreaterThan(initialPulls)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('web-update-available.png'),
  })

  update = 'required'
  send?.(JSON.stringify({ type: 'tasks', sequence: 2 }))
  const dialog = page.getByRole('dialog', { name: '請重新整理 Famo' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('web-update-required.png'),
  })

  update = 'none'
  await dialog.getByRole('button', { name: '重新整理' }).click()
  await expect(dialog).toHaveCount(0)
})

test('uses the local push acknowledgement and still pulls an earlier remote change', async ({
  page,
}) => {
  let send: WebSocketRoute['send'] | undefined
  const changes: Change[] = []
  const cursors: number[] = []
  let collectionReads = 0
  await page.routeWebSocket('**/api/sync/events?protocol=1', (socket) => {
    send = (message) => socket.send(message)
  })
  await page.route('**/api/sync/collections', (route) => {
    collectionReads++
    return route.fulfill({ json: { version: 0, projects: [], boards: [] } })
  })
  await page.route('**/api/sync/pull?*', (route) => {
    const after = Number(
      new URL(route.request().url()).searchParams.get('after'),
    )
    cursors.push(after)
    const pending = changes.filter(({ sequence }) => sequence > after)
    return route.fulfill({
      json: {
        changes: pending,
        cursor: pending.at(-1)?.sequence ?? after,
        has_more: false,
      },
    })
  })
  await page.route('**/api/sync/push', async (route) => {
    const operation: Operation = route.request().postDataJSON()
    const change = { sequence: 2, task: operation.task }
    changes.push(
      {
        sequence: 1,
        task: { ...operation.task, id: 'remote-task', title: 'Remote task' },
      },
      change,
    )
    // Deliver the echo before answering the HTTP write.
    send?.(JSON.stringify({ type: 'tasks', sequence: 2 }))
    await route.fulfill({ json: { change } })
  })

  await page.goto('/')
  await expect.poll(() => Boolean(send)).toBe(true)
  await expect(
    page.getByRole('button', { name: '同步', exact: true }),
  ).toHaveAttribute('data-sync-status', 'synced')
  await page.getByRole('button', { name: '快速新增任務', exact: true }).tap()
  await page
    .getByRole('textbox', { name: '快速新增任務名稱' })
    .fill('Local task')

  const initialPulls = cursors.length
  const initialCollections = collectionReads
  await page.getByRole('button', { name: '新增這一列', exact: true }).click()
  const capture = page.getByRole('dialog', { name: '快速新增任務' })
  await expect(capture.getByRole('status')).toHaveText('已新增：Local task')
  await capture.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: '完成任務：Local task' }),
  ).toBeVisible()
  const noRead = expect(
    page.waitForRequest(
      (request) =>
        request.method() === 'GET' &&
        /\/api\/sync\/(?:pull\?|collections$)/.test(request.url()),
      { timeout: 350 },
    ),
  ).rejects.toThrow('Timeout')
  // A delayed echo of the same write should also leave the network idle.
  send?.(JSON.stringify({ type: 'tasks', sequence: 2 }))
  await noRead
  expect(cursors).toHaveLength(initialPulls)
  expect(collectionReads).toBe(initialCollections)

  send?.(JSON.stringify({ type: 'tasks', sequence: 1 }))
  await expect(
    page.getByRole('checkbox', { name: '完成任務：Remote task' }),
  ).toBeVisible()
  expect(cursors.slice(initialPulls)).toEqual([0])
})
