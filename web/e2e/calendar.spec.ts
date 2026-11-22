import { expect, test, type Locator, type Page } from '@playwright/test'
import { selectCalendarDate, setTaskDate } from './date-picker'

test.use({ timezoneId: 'Asia/Taipei' })

async function chooseDate(page: Page, date: string) {
  await page.getByRole('button', { name: '開啟日期選單', exact: true }).click()
  await selectCalendarDate(page, date)
}

async function openDate(page: Page, date = '2026-11-04') {
  await page.goto('/')
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await chooseDate(page, date)
}

const rowTitle = (page: Page, title: string) =>
  page.getByRole('textbox', { name: `編輯任務標題：${title}`, exact: true })

test('日期只看所屬日期，完成留在當天，先前任務只提供轉移選取', async ({
  page,
  request,
}) => {
  for (const [title, date] of [
    ['calendar-scope 當天', '2026-11-04'],
    ['calendar-scope 昨天', '2026-11-03'],
    ['calendar-scope 無日期', ''],
    ['calendar-scope 明天', '2026-11-05'],
    ['calendar-scope 無日期已完成', ''],
  ]) {
    const response = await request.post('/api/tasks', {
      data: { title, scheduled_date: date },
    })
    expect(response.status()).toBe(201)
    if (title.endsWith('已完成')) {
      const task = await response.json()
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: { op: 'complete_task', version: task.version },
      })
    }
  }
  await openDate(page)
  await page.getByLabel('搜尋任務').fill('calendar-scope')
  const daily = page.getByRole('list', { name: '當日未完成任務', exact: true })
  await expect(daily.locator('[data-task-id]')).toHaveCount(1)
  await expect(rowTitle(page, 'calendar-scope 無日期')).toHaveCount(0)
  await expect(rowTitle(page, 'calendar-scope 無日期已完成')).toHaveCount(0)
  await expect(rowTitle(page, 'calendar-scope 明天')).toHaveCount(0)
  await daily
    .getByRole('checkbox', {
      name: '完成任務：calendar-scope 當天',
      exact: true,
    })
    .click()
  const completed = page.getByRole('list', {
    name: '當日已完成任務',
    exact: true,
  })
  await expect(
    completed.getByRole('checkbox', {
      name: '恢復任務：calendar-scope 當天',
      exact: true,
    }),
  ).toBeChecked()
  await expect(daily.locator('[data-task-id]')).toHaveCount(0)
  const earlier = page.locator('details.earlier-tasks')
  await expect(earlier).not.toHaveAttribute('open')
  await earlier.locator('summary').click()
  await expect(earlier.locator('[data-task-id]')).toHaveCount(1)
  await expect(
    earlier.getByRole('checkbox', {
      name: '完成任務：calendar-scope 昨天',
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(
    earlier.getByRole('checkbox', {
      name: '選取任務：calendar-scope 昨天',
      exact: true,
    }),
  ).toBeVisible()
  await expect(completed.locator('[data-task-id]')).toHaveCount(1)
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await expect(page.locator('h1 time')).toHaveAttribute(
    'datetime',
    '2026-11-03',
  )
  await expect(
    page.getByRole('checkbox', {
      name: '完成任務：calendar-scope 昨天',
      exact: true,
    }),
  ).not.toBeChecked()
  await page.reload()
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await chooseDate(page, '2026-11-03')
  await expect(rowTitle(page, 'calendar-scope 昨天')).toBeVisible()
})

test('前後一天、日曆選日、當地今日與手機版', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T16:30:00Z') })
  await openDate(page)
  await page.getByRole('button', { name: '今日', exact: true }).click()
  await expect(page.locator('h1 time')).toHaveAttribute(
    'datetime',
    '2026-11-04',
  )
  for (const [start, previous, next] of [
    ['2026-01-01', '2025-12-31', '2026-01-02'],
    ['2028-03-01', '2028-02-29', '2028-03-02'],
    ['2026-03-01', '2026-02-28', '2026-03-02'],
  ]) {
    await chooseDate(page, start)
    await page.getByRole('button', { name: '前一天', exact: true }).click()
    await expect(page.locator('h1 time')).toHaveAttribute('datetime', previous)
    await page.getByRole('button', { name: '後一天', exact: true }).click()
    await page.getByRole('button', { name: '後一天', exact: true }).click()
    await expect(page.locator('h1 time')).toHaveAttribute('datetime', next)
  }
  await page.clock.setSystemTime(new Date('0001-01-01T12:00:00+08:00'))
  await page.getByRole('button', { name: '今日', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '前一天', exact: true }),
  ).toBeDisabled()
  await page.clock.setSystemTime(new Date('9999-12-31T12:00:00+08:00'))
  await page.getByRole('button', { name: '今日', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '後一天', exact: true }),
  ).toBeDisabled()
  await page.clock.setSystemTime(new Date('2026-11-03T16:30:00Z'))
  await page.getByRole('button', { name: '今日', exact: true }).click()
  await page.screenshot({
    path: '/private/tmp/famo-calendar-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('button', { name: '開啟日期選單', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: '前一天', exact: true }).click()
  await expect(page.locator('h1 time')).toHaveAttribute(
    'datetime',
    '2026-11-03',
  )
  await page.screenshot({
    path: '/private/tmp/famo-calendar-mobile.png',
    fullPage: true,
  })
})

test('一句話新增使用當日、修改與清除日期、全部任務不預設日期', async ({
  page,
  request,
}) => {
  await openDate(page, '2026-12-15')
  const capture = page.getByRole('textbox', {
    name: '快速新增任務名稱',
    exact: true,
  })
  await capture.fill('calendar-create 快速新增')
  await capture.press('Enter')
  await expect(rowTitle(page, 'calendar-create 快速新增')).toBeVisible()
  const dialog = page.getByRole('dialog')
  await page
    .getByRole('button', {
      name: '任務詳情：calendar-create 快速新增',
      exact: true,
    })
    .click()
  const dateButton = dialog.getByRole('button', { name: /^任務日期：/ })
  await dateButton.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('dialog', { name: '選擇日期' })).toHaveCount(0)
  await expect(dateButton).toBeFocused()
  await setTaskDate(dialog, '2026-12-16')
  await expect(dialog.getByRole('button', { name: /^任務日期：/ })).toHaveText(
    '2026-12-16',
  )
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(rowTitle(page, 'calendar-create 快速新增')).toHaveCount(0)
  await page.getByRole('button', { name: '後一天', exact: true }).click()
  await expect(rowTitle(page, 'calendar-create 快速新增')).toBeVisible()
  await page
    .getByRole('button', {
      name: '任務詳情：calendar-create 快速新增',
      exact: true,
    })
    .click()
  await dialog.getByRole('button', { name: '清除日期', exact: true }).click()
  await expect(dialog.getByRole('button', { name: /^任務日期：/ })).toHaveText(
    '未指定日期',
  )
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(rowTitle(page, 'calendar-create 快速新增')).toHaveCount(0)
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  await expect(rowTitle(page, 'calendar-create 快速新增')).toBeVisible()
  await capture.fill('calendar-create 無日期')
  await capture.press('Enter')
  await expect(rowTitle(page, 'calendar-create 無日期')).toBeVisible()
  const tasks = await (await request.get('/api/tasks')).json()
  expect(
    tasks.find((t: { title: string }) => t.title === 'calendar-create 無日期')
      .scheduled_date,
  ).toBe('')
})

test('先前未完成逐筆與多選移入，衝突保留原任務且可重試', async ({
  page,
  request,
}) => {
  const tasks = []
  for (const suffix of ['A', 'B', 'C']) {
    tasks.push(
      await (
        await request.post('/api/tasks', {
          data: {
            title: `calendar-move ${suffix}`,
            scheduled_date: '2026-11-02',
          },
        })
      ).json(),
    )
  }
  await openDate(page)
  await page.getByLabel('搜尋任務').fill('calendar-move')
  const earlier = page.locator('details.earlier-tasks')
  await earlier.locator('summary').click()
  await expect(earlier.locator('[data-task-id]')).toHaveCount(3)
  await expect(earlier.locator('time')).toHaveCount(1)
  await expect(earlier.locator('time')).toHaveText('2026-11-02')
  await expect(earlier.getByRole('checkbox')).toHaveCount(4)
  await earlier
    .locator('.task-move-row')
    .filter({
      has: page.getByRole('textbox', {
        name: '編輯任務標題：calendar-move A',
        exact: true,
      }),
    })
    .getByRole('button', { name: '移到這天', exact: true })
    .click()
  await expect(
    page
      .getByRole('list', { name: '當日未完成任務', exact: true })
      .locator('[data-task-id]'),
  ).toHaveCount(1)
  await earlier
    .getByRole('checkbox', { name: '選取任務：calendar-move B', exact: true })
    .click()
  const selectAll = earlier.getByRole('checkbox', {
    name: '全選先前未完成任務',
  })
  await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
  await selectAll.click()
  await expect(selectAll).toBeChecked()
  await selectAll.click()
  await expect(selectAll).not.toBeChecked()
  await page.getByLabel('搜尋任務').fill('calendar-move B')
  await selectAll.click()
  await page.getByLabel('搜尋任務').fill('calendar-move')
  await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
  await selectAll.click()
  await request.post(`/api/tasks/${tasks[1].id}/actions`, {
    data: {
      op: 'update',
      version: tasks[1].version,
      description: 'concurrent edit',
    },
  })
  await earlier
    .getByRole('button', { name: '將選取任務移到這天（2）', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('任務已被更新')
  await expect(earlier.locator('[data-task-id]')).toHaveCount(1)
  await expect(
    earlier.getByRole('checkbox', {
      name: '選取任務：calendar-move B',
      exact: true,
    }),
  ).toBeChecked()
  await earlier
    .getByRole('button', { name: '將選取任務移到這天（1）', exact: true })
    .click()
  await expect(earlier.locator('[data-task-id]')).toHaveCount(0)
  await expect(
    page
      .getByRole('list', { name: '當日未完成任務', exact: true })
      .locator('[data-task-id]'),
  ).toHaveCount(3)
})

test('新增草稿切換日期後重試仍儲存原日期', async ({ page, request }) => {
  await openDate(page, '2026-12-20')
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'test save failure' }),
      })
    else await route.continue()
  })
  const capture = page.getByRole('textbox', {
    name: '快速新增任務名稱',
    exact: true,
  })
  await capture.fill('calendar-retry 保留日期')
  await capture.press('Enter')
  await expect(
    page.getByRole('button', { name: '重試', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '後一天', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '重試', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  await page.unroute('**/api/tasks')
  await page.getByRole('button', { name: '重試', exact: true }).click()
  await expect(rowTitle(page, 'calendar-retry 保留日期')).toBeVisible()
  const tasks = await (await request.get('/api/tasks')).json()
  expect(
    tasks.find((t: { title: string }) => t.title === 'calendar-retry 保留日期')
      .scheduled_date,
  ).toBe('2026-12-20')
})

test('日期立即更新遇到版本衝突保留選擇', async ({ page, request }) => {
  const task = await (
    await request.post('/api/tasks', {
      data: { title: 'calendar-conflict 日期', scheduled_date: '2026-11-04' },
    })
  ).json()
  await openDate(page)
  await page
    .getByRole('button', {
      name: '任務詳情：calendar-conflict 日期',
      exact: true,
    })
    .click()
  const dialog = page.getByRole('dialog')
  await page.route(
    `**/api/tasks/${task.id}/actions`,
    async (route) => {
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: {
          op: 'update',
          version: task.version,
          scheduled_date: '2026-11-06',
        },
      })
      await route.continue()
    },
    { times: 1 },
  )
  await setTaskDate(dialog, '2026-11-05')
  await expect(dialog.getByRole('alert')).toContainText('任務已')
  await expect(dialog.getByRole('button', { name: /^任務日期：/ })).toHaveText(
    '2026-11-05',
  )
  await dialog
    .getByRole('button', { name: '讀取最新日期', exact: true })
    .click()
  await expect(dialog.getByRole('button', { name: /^任務日期：/ })).toHaveText(
    '2026-11-06',
  )
})

test('日期頁排序只調整當天未完成任務，不包含已完成或其他日期', async ({
  page,
  request,
}) => {
  const created = []
  for (const [suffix, date] of [
    ['A', '2026-12-25'],
    ['other', '2026-12-26'],
    ['B', '2026-12-25'],
    ['done', '2026-12-25'],
    ['C', '2026-12-25'],
  ]) {
    const task = await (
      await request.post('/api/tasks', {
        data: { title: `calendar-order ${suffix}`, scheduled_date: date },
      })
    ).json()
    created.push(task)
    if (suffix === 'done')
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: { op: 'complete_task', version: task.version },
      })
  }
  await openDate(page, '2026-12-25')
  await page.getByLabel('搜尋任務').fill('calendar-order')
  const list = page.getByRole('list', { name: '當日未完成任務', exact: true })
  const values = () =>
    list
      .locator('input.todo-title')
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLInputElement).value),
      )
  await expect
    .poll(values)
    .toEqual(['calendar-order A', 'calendar-order B', 'calendar-order C'])
  const save = page.waitForResponse((res) =>
    res.url().endsWith('/api/tasks/reorder'),
  )
  await list
    .getByRole('button', { name: '拖曳排序：calendar-order C', exact: true })
    .focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  const result = await save
  expect(result.status()).toBe(200)
  expect(result.request().postDataJSON().task_ids).toEqual([
    created[0].id,
    created[4].id,
    created[2].id,
  ])
  await expect
    .poll(values)
    .toEqual(['calendar-order A', 'calendar-order C', 'calendar-order B'])
  const saved = await (await request.get('/api/tasks')).json()
  expect(
    saved
      .filter((task: { title: string }) =>
        task.title.startsWith('calendar-order'),
      )
      .map((task: { title: string }) => task.title),
  ).toEqual([
    'calendar-order A',
    'calendar-order other',
    'calendar-order C',
    'calendar-order B',
    'calendar-order done',
  ])
})

test('日期標題與今日分段選單：月曆選日、鍵盤、關閉及手機畫面', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-03T16:30:00Z') })
  await openDate(page)
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toContainText('2026年11月4日')
  await expect(
    page.getByRole('button', { name: '完整表單', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '新增任務', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('textbox', { name: '快速新增任務名稱' }),
  ).toBeVisible()
  const previous = (await page
    .getByRole('button', { name: '前一天', exact: true })
    .boundingBox())!
  const todayButton = (await page
    .getByRole('button', { name: '今日', exact: true })
    .boundingBox())!
  const next = (await page
    .getByRole('button', { name: '後一天', exact: true })
    .boundingBox())!
  expect(previous.x).toBeLessThan(todayButton.x)
  expect(todayButton.x).toBeLessThan(next.x)
  const headingBox = (await heading.boundingBox())!
  expect(previous.x).toBeGreaterThan(headingBox.x + headingBox.width)
  const searchBox = (await page.getByLabel('搜尋任務').boundingBox())!
  expect(searchBox.x).toBeGreaterThan(next.x + next.width)
  expect(Math.abs(searchBox.y - todayButton.y)).toBeLessThan(8)

  await expect(page.getByLabel('選擇日期', { exact: true })).toHaveCount(0)
  const trigger = page.getByRole('button', {
    name: '開啟日期選單',
    exact: true,
  })
  const calendar = page.getByRole('dialog', { name: '選擇日期', exact: true })
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(
    calendar.getByRole('button', { name: '2026-11-04', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('ArrowRight')
  const nextDate = calendar.getByRole('button', {
    name: '2026-11-05',
    exact: true,
  })
  await expect(nextDate).toBeFocused()
  await expect(nextDate).toHaveCSS('outline-style', 'none')
  await page.keyboard.press('Enter')
  await expect(page.locator('h1 time')).toHaveAttribute(
    'datetime',
    '2026-11-05',
  )
  await expect(calendar).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await calendar.getByRole('button', { name: '下一個月', exact: true }).click()
  await calendar
    .getByRole('button', { name: '2026-12-12', exact: true })
    .click()
  await expect(page.locator('h1 time')).toHaveAttribute(
    'datetime',
    '2026-12-12',
  )
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(calendar).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await heading.click()
  await expect(calendar).toHaveCount(0)
  await page.getByRole('button', { name: '今日', exact: true }).click()
  await expect(page.locator('h1 time')).toHaveAttribute(
    'datetime',
    '2026-11-04',
  )
  await trigger.click()
  await page.screenshot({
    path: '/private/tmp/famo-date-picker-desktop.png',
    fullPage: true,
  })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  await expect(calendar).toBeVisible()
  const box = (await calendar.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: '/private/tmp/famo-date-picker-mobile.png',
    fullPage: true,
  })
  await calendar
    .getByRole('button', { name: '2026-11-10', exact: true })
    .click()
  await expect(page.locator('h1 time')).toHaveAttribute(
    'datetime',
    '2026-11-10',
  )
})

test('任務列可直接安排與清除日期，手機月曆支援月份及年份切換', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 600 })
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') })
  const task = await (
    await request.post('/api/tasks', {
      data: {
        title: '從列表重新安排',
        scheduled_date: '2026-11-04',
        links: [{ url: 'https://docs.google.com/document/d/spec/edit' }],
      },
    })
  ).json()
  await page.goto('/')
  const row = page.locator(`[data-task-id="${task.id}"]`)
  const trigger = row.getByRole('button', { name: '設定日期：從列表重新安排' })
  const detailButton = row.getByRole('button', {
    name: '任務詳情：從列表重新安排',
  })
  expect((await trigger.boundingBox())!.x).toBeLessThan(
    (await detailButton.boundingBox())!.x,
  )
  await trigger.click()
  const calendar = page.getByRole('dialog', { name: '選擇日期', exact: true })
  const box = (await calendar.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.y + box.height).toBeLessThanOrEqual(600)
  await calendar
    .getByRole('button', { name: '2026 年 11 月', exact: true })
    .click()
  await calendar.getByRole('button', { name: '2026 年', exact: true }).click()
  await calendar
    .getByRole('button', { name: '下一組年份', exact: true })
    .click()
  await calendar.getByRole('button', { name: '2030 年', exact: true }).click()
  await calendar.getByRole('button', { name: '3 月', exact: true }).click()
  await calendar
    .getByRole('button', { name: '2030-03-08', exact: true })
    .click()
  await expect(row).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  await expect(trigger).toHaveAttribute('title', '任務日期：2030-03-08')
  await trigger.click()
  await expect(
    calendar.getByRole('button', { name: '2030-03-08' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await calendar.getByRole('button', { name: '清除日期', exact: true }).click()
  await expect(trigger).toHaveAttribute('title', '設定日期')
  const saved = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(saved.scheduled_date).toBe('')
})

test('已完成任務依完成時間由新到舊排序', async ({ page, request }) => {
  const created = []
  for (const title of ['較早建立', '較晚建立', '尚未完成']) {
    created.push(
      await (
        await request.post('/api/tasks', {
          data: {
            title: `completion-sort ${title}`,
            scheduled_date: '2026-11-04',
          },
        })
      ).json(),
    )
  }
  await openDate(page)
  await page.getByLabel('搜尋任務').fill('completion-sort')
  const daily = page.getByRole('list', { name: '當日未完成任務', exact: true })
  for (const task of created.slice(0, 2)) {
    await daily
      .getByRole('checkbox', { name: `完成任務：${task.title}` })
      .click()
    await expect(daily.locator(`[data-task-id="${task.id}"]`)).toHaveCount(0)
  }
  const sortedIds = [created[1].id, created[0].id]
  const rowIds = (list: Locator) =>
    list
      .locator('[data-task-id]')
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-task-id')),
      )
  const dailyCompleted = page.getByRole('list', {
    name: '當日已完成任務',
    exact: true,
  })
  await expect.poll(() => rowIds(dailyCompleted)).toEqual(sortedIds)
  await page.getByRole('button', { name: /^已完成/ }).click()
  const completed = page.getByRole('list', {
    name: '已完成任務列表',
    exact: true,
  })
  await expect.poll(() => rowIds(completed)).toEqual(sortedIds)
  await page.reload()
  await page.getByLabel('搜尋任務').fill('completion-sort')
  await page.getByRole('button', { name: /^已完成/ }).click()
  await expect.poll(() => rowIds(completed)).toEqual(sortedIds)
})

test('搜尋框聚焦時，外框包含搜尋圖示', async ({ page }) => {
  await page.goto('/')
  for (const name of [/^今日任務$/, /^任務列表$/, /^已完成/]) {
    await page.getByRole('button', { name }).click()
    const search = page.locator('.search')
    const icon = search.locator('svg')
    const input = page.getByRole('textbox', { name: '搜尋任務' })
    await icon.click()
    await expect(input).toBeFocused()
    await expect(search).toHaveCSS('outline-width', '2px')
    await expect(search).toHaveCSS('outline-style', 'solid')
    await expect(input).toHaveCSS('outline-style', 'none')
  }
})

test('任務列表用相對日期開啟月曆，可跨年切換月份並重新排程', async ({
  page,
  request,
}) => {
  await page.clock.setFixedTime(new Date('2026-01-01T00:30:00+08:00'))
  const dates = [
    ['2025-12-29', '2025-12-29'],
    ['2025-12-31', '昨天'],
    ['2026-01-01', '今天'],
    ['2026-01-02', '明天'],
  ]
  for (const [date] of dates) {
    expect(
      (
        await request.post('/api/tasks', {
          data: { title: '跨年計畫 ' + date, scheduled_date: date },
        })
      ).status(),
    ).toBe(201)
  }
  await page.goto('/')
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  await page.getByLabel('搜尋任務').fill('跨年計畫')
  for (const [date, label] of dates) {
    const button = page.getByRole('button', {
      name: '設定日期：跨年計畫 ' + date,
    })
    await expect(button).toHaveText(label)
    await expect(button.locator('time')).toHaveClass(
      date < '2026-01-01' ? 'overdue-date' : '',
    )
  }
  const trigger = page.getByRole('button', {
    name: '設定日期：跨年計畫 2025-12-31',
  })
  const overdueDate = trigger.locator('time')
  await expect(overdueDate).toHaveCSS('font-weight', '500')
  await expect(overdueDate).toHaveCSS('color', 'rgb(160, 63, 50)')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: '外觀', exact: true }).click()
  await page.getByRole('radio', { name: '午夜', exact: true }).check()
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  await page.getByLabel('搜尋任務').fill('跨年計畫')
  await expect(overdueDate).toHaveCSS('color', 'rgb(255, 156, 174)')
  await page.screenshot({ path: '/private/tmp/famo-overdue-midnight.png' })
  await trigger.click()
  const calendar = page.getByRole('dialog', { name: '選擇日期' })
  await calendar.getByRole('button', { name: '下一個月' }).click()
  await expect(
    calendar.getByRole('button', { name: '2026 年 1 月' }),
  ).toBeVisible()
  await calendar.getByRole('button', { name: '上一個月' }).click()
  await expect(
    calendar.getByRole('button', { name: '2025 年 12 月' }),
  ).toBeVisible()
  await page.screenshot({
    path: '/private/tmp/famo-task-list-relative-dates.png',
  })
  await calendar.getByRole('button', { name: '2025-12-28' }).click()
  await expect(trigger).toHaveText('2025-12-28')
  await page.reload()
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  await expect(trigger).toHaveText('2025-12-28')
})
