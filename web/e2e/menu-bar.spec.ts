import { expect, test } from '@playwright/test'
import type { Task } from '../src/lib/api'

test.use({ timezoneId: 'Asia/Taipei', viewport: { width: 360, height: 480 } })

test('dedicated panel entry stays compact after opening settings and reloading', async ({
  page,
  context,
}) => {
  const main = await context.newPage()
  await main.goto('/')
  await main.getByRole('button', { name: '設定', exact: true }).click()
  await expect(
    main.getByRole('heading', { name: '設定', exact: true }),
  ).toBeVisible()

  await page.goto('/menu-bar.html')
  await expect(page.getByRole('heading', { name: '今日任務' })).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(new Event('famo:open-settings')),
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: '今日任務' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '設定', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: '設定', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Open Famo', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: '/private/tmp/famo-menu-bar-entry.png' })
  await main.close()
})

test('panel counts scheduled local tasks, reflects API edits and rolls over at midnight', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date('2040-01-10T04:00:00Z') })
  const create = async (title: string, scheduled_date: string) => {
    const response = await request.post('/api/tasks', {
      data: { title, scheduled_date },
    })
    expect(response.ok()).toBe(true)
    return (await response.json()) as Task
  }
  const first = await create('整理今天的想法', '2040-01-10')
  const second = await create('喝一杯水', '2040-01-10')
  await create('明天的任務', '2040-01-11')
  await create('先前的任務', '2040-01-09')
  await create('還沒安排的任務', '')
  await request.post(`/api/tasks/${second.id}/actions`, {
    data: { op: 'complete_task', version: second.version },
  })
  await page.goto('/menu-bar.html')
  const list = page.getByRole('list', { name: '今日任務列表' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('status')).toHaveText('已完成 1 / 2 件')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1')
  await expect(page.locator('.menu-bar-progress')).toContainText('50%')
  await expect(list.getByRole('listitem').first()).toContainText(first.title)
  const open = await page
    .getByRole('button', { name: 'Open Famo', exact: true })
    .boundingBox()
  const date = await page.locator('time').boundingBox()
  expect(open!.y).toBeLessThan(50)
  expect(date!.x + date!.width).toBeLessThan(open!.x)
  await expect(page.getByRole('checkbox').first()).toHaveCSS(
    'border-radius',
    '3px',
  )
  await page.screenshot({ path: '/private/tmp/famo-menu-bar-light.png' })
  await request.post(`/api/tasks/${first.id}/actions`, {
    data: { op: 'complete_task', version: first.version },
  })
  await page.clock.runFor(2_100)
  await expect(page.getByRole('status')).toContainText('已完成 2 / 2 件')
  await page.clock.setSystemTime(new Date('2040-01-10T16:00:00Z'))
  await page.clock.runFor(1_100)
  await expect(page.locator('time')).toHaveAttribute('datetime', '2040-01-11')
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toContainText('明天的任務')
  await expect(page.getByRole('status')).toHaveText('已完成 0 / 1 件')
})

test('panel switches today’s tasks and progress by Board and remembers the selection', async ({
  page,
  request,
}) => {
  const date = '2040-02-01'
  await page.clock.setFixedTime(new Date(`${date}T12:00:00+08:00`))
  const project = await request.post('/api/projects', {
    data: { name: '選單列工作' },
  })
  await expect(project).toBeOK()
  const { id: projectId } = await project.json()
  const work = await request.post('/api/boards', {
    data: { name: '工作', project_ids: [projectId] },
  })
  await expect(work).toBeOK()
  const { id: workId, version: workVersion } = await work.json()
  const empty = await request.post('/api/boards', {
    data: { name: '選單列空白 Board', project_ids: [] },
  })
  await expect(empty).toBeOK()

  for (const input of [
    { title: '整理工作', project_id: projectId, scheduled_date: date },
    { title: '下班採買', scheduled_date: date },
    { title: '明天寄出', project_id: projectId, scheduled_date: '2040-02-02' },
  ]) {
    await expect(await request.post('/api/tasks', { data: input })).toBeOK()
  }

  await page.goto('/menu-bar.html')
  const picker = page.getByRole('button', { name: /^選擇 Board/ })
  const menu = page.getByRole('menu', { name: 'Board' })
  const choice = (name: string) =>
    menu.getByRole('menuitemradio', { name, exact: true })
  const list = page.getByRole('list', { name: '今日任務列表' })
  await expect(picker).toHaveText('今日')
  await expect(picker).toHaveCSS('font-size', '16px')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(page.locator('footer')).toHaveText(/^famo \d+\.\d+\.\d+$/)

  await picker.press('ArrowDown')
  await expect(choice('今日')).toBeFocused()
  await expect(choice('今日')).toHaveAttribute('aria-checked', 'true')
  await expect(choice('今日')).toHaveCSS('font-size', '16px')
  await expect(choice('今日').locator('span')).toHaveCSS(
    'text-decoration-line',
    'none',
  )
  await page.keyboard.press('ArrowDown')
  await expect(choice('今日')).not.toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(picker).toBeFocused()
  await expect(picker).toHaveCSS('outline-style', 'none')

  await picker.click()
  await choice('工作').click()
  await expect(picker).toHaveText('工作')
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toHaveText('整理工作')
  await list.getByRole('checkbox').click()
  await expect(page.getByRole('status')).toContainText('已完成 1 / 1 件')
  await page.screenshot({ path: '/private/tmp/famo-menu-bar-board.png' })
  await picker.click()
  await expect(choice('工作')).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: '/private/tmp/famo-menu-bar-board-open.png' })
  await page.locator('time').click()
  await expect(menu).toBeHidden()

  await page.reload()
  await expect(picker).toHaveText('工作')
  await expect(list).toHaveText('整理工作')
  await picker.click()
  await choice('選單列空白 Board').press('Enter')
  await expect(page.getByText('這個 Board 今天沒有任務。')).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0')
  await picker.click()
  await choice('工作').click()

  const deleted = await request.post(`/api/boards/${workId}/delete`, {
    data: { version: workVersion },
  })
  await expect(deleted).toBeOK()
  await expect(picker).toHaveText('今日')
  await expect(page.getByRole('status')).toHaveText('已完成 1 / 2 件')
})

test('square checkboxes complete and reopen tasks, preserve dates and recover from failures and conflicts', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date('2042-03-04T04:00:00Z') })
  const response = await request.post('/api/tasks', {
    data: {
      title: '在選單列完成任務',
      scheduled_date: '2042-03-04',
      description: '保留備註',
    },
  })
  const task = (await response.json()) as Task
  await page.goto('/menu-bar.html')
  const complete = page.getByRole('checkbox', {
    name: `完成任務：${task.title}`,
    exact: true,
  })
  const reopen = page.getByRole('checkbox', {
    name: `恢復任務：${task.title}`,
    exact: true,
  })
  await expect(complete).not.toBeChecked()
  await complete.click()
  await expect(reopen).toBeChecked()
  await expect(page.getByRole('status')).toContainText('已完成 1 / 1 件')
  const saved = (await (
    await request.get(`/api/tasks/${task.id}`)
  ).json()) as Task
  expect(saved.scheduled_date).toBe('2042-03-04')
  expect(saved.description).toBe('保留備註')
  expect(saved.version).toBe(task.version + 1)
  await reopen.click()
  await expect(complete).not.toBeChecked()
  await expect(page.getByRole('status')).toHaveText('已完成 0 / 1 件')

  let writes = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/api/tasks/${task.id}/actions`, async (route) => {
    writes++
    await pending
    await route.fulfill({ status: 500, json: { error: '暫時無法寫入' } })
  })
  await complete.click()
  await expect(complete).toBeDisabled()
  await complete.evaluate((element: HTMLButtonElement) => element.click())
  expect(writes).toBe(1)
  release()
  await expect(page.getByRole('alert')).toContainText('暫時無法寫入')
  await expect(complete).not.toBeChecked()
  await expect(complete).toBeEnabled()
  await page.unroute(`**/api/tasks/${task.id}/actions`)

  // Another client changes the version after the panel sends its snapshot.
  await page.route(
    `**/api/tasks/${task.id}/actions`,
    async (route) => {
      const snapshot = route.request().postDataJSON() as { version: number }
      const changed = await request.post(`/api/tasks/${task.id}/actions`, {
        data: { op: 'complete_task', version: snapshot.version },
      })
      expect(changed.ok()).toBe(true)
      await route.continue()
    },
    { times: 1 },
  )
  await complete.click()
  await expect(page.getByRole('alert')).toContainText('任務已變更')
  await expect(reopen).toBeChecked()
  await reopen.click()
  await expect(complete).not.toBeChecked()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('panel writes refresh an already open main window without focus or polling', async ({
  page,
  context,
  request,
}) => {
  const time = new Date('2044-05-06T04:00:00Z')
  await page.clock.install({ time })
  await page.setViewportSize({ width: 1100, height: 780 })
  const created = await request.post('/api/tasks', {
    data: { title: '兩個視窗同步', scheduled_date: '2044-05-06' },
  })
  const task = (await created.json()) as Task
  let mainReads = 0
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() === 'GET') mainReads++
    await route.continue()
  })
  await page.goto('/')
  const mainComplete = page.getByRole('checkbox', {
    name: `完成任務：${task.title}`,
    exact: true,
  })
  const mainReopen = page.getByRole('checkbox', {
    name: `恢復任務：${task.title}`,
    exact: true,
  })
  await expect(mainComplete).not.toBeChecked()
  const initialReads = mainReads
  const panel = await context.newPage()
  await panel.clock.install({ time })
  await panel.goto('/menu-bar.html')
  await panel
    .getByRole('checkbox', { name: `完成任務：${task.title}`, exact: true })
    .click()
  await expect(mainReopen).toBeChecked({ timeout: 3_000 })
  expect(mainReads).toBeGreaterThan(initialReads)
  await panel
    .getByRole('checkbox', { name: `恢復任務：${task.title}`, exact: true })
    .click()
  await expect(mainComplete).not.toBeChecked({ timeout: 3_000 })

  // A failed write must not tell another window that a task changed.
  const readsBeforeFailure = mainReads
  await panel.route(`**/api/tasks/${task.id}/actions`, (route) =>
    route.fulfill({ status: 500, json: { error: '暫時無法寫入' } }),
  )
  await panel
    .getByRole('checkbox', { name: `完成任務：${task.title}`, exact: true })
    .click()
  await expect(panel.getByRole('alert')).toContainText('暫時無法寫入')
  await expect(mainComplete).not.toBeChecked()
  expect(mainReads).toBe(readsBeforeFailure)
  await panel.unroute(`**/api/tasks/${task.id}/actions`)

  // Changes made in the main window also reach the panel before its 2s poll.
  await panel.clock.pauseAt(new Date('2044-05-06T04:00:05Z'))
  const panelRefresh = panel.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tasks') &&
      response.request().method() === 'GET',
  )
  await page.bringToFront()
  await mainComplete.click()
  await (await panelRefresh).finished()
  await panel.clock.resume()
  await expect(
    panel.getByRole('checkbox', {
      name: `恢復任務：${task.title}`,
      exact: true,
    }),
  ).toBeChecked({ timeout: 3_000 })
  await panel.close()
})

test('empty panel follows theme changes and Open Famo returns to the main app', async ({
  page,
  context,
}) => {
  await page.clock.install({ time: new Date('2041-02-03T04:00:00Z') })
  await page.goto('/menu-bar.html')
  await expect(page.getByRole('status')).toHaveText('今天還沒有安排任務')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0')
  const other = await context.newPage()
  await other.goto('/')
  await other.getByRole('button', { name: '設定', exact: true }).click()
  await other.getByRole('radio', { name: '午夜', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  await expect(page.locator('.menu-bar-panel')).toHaveCSS(
    'background-color',
    'rgb(30, 40, 56)',
  )
  await expect(
    page.getByRole('button', { name: 'Open Famo', exact: true }),
  ).toHaveCSS('background-color', 'rgb(145, 185, 242)')
  await page.screenshot({ path: '/private/tmp/famo-menu-bar-dark.png' })
  await other.close()
  await page.getByRole('button', { name: 'Open Famo', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('button', { name: '今日任務', exact: true }),
  ).toBeVisible()
})

test('failed reads show an error and retry recovers without claiming an empty day', async ({
  page,
}) => {
  await page.route('**/api/tasks', (route) =>
    route.fulfill({ status: 500, json: { error: 'read failed' } }),
  )
  await page.goto('/menu-bar.html')
  await expect(page.getByRole('alert')).toContainText('無法讀取任務')
  await expect(page.getByRole('status')).toHaveText('今日進度暫時無法更新')
  await expect(page.locator('.menu-bar-progress')).toContainText('—')
  await page.unroute('**/api/tasks')
  await page.route('**/api/tasks', (route) => route.fulfill({ json: [] }))
  await page.getByRole('button', { name: '重試', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('今天還沒有安排任務')
})
