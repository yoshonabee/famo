import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Taipei' })

test('首頁是當地今日，小步驟直接新增與完成，不需維護分類或階段', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date('2026-11-03T16:30:00Z') })
  await page.goto('/')
  await expect(page.locator('h1 time')).toHaveAttribute(
    'datetime',
    '2026-11-04',
  )
  const navigation = page.getByRole('navigation', { name: '主要導覽' })
  for (const name of ['今日任務', '任務列表', '已完成']) {
    await expect(
      navigation.getByRole('button', { name, exact: true }),
    ).toBeVisible()
  }
  const capture = page.getByRole('textbox', { name: '快速新增任務名稱' })
  await capture.fill('討論登入修正 spec')
  await capture.press('Enter')
  const active = page.getByRole('list', { name: '當日未完成任務', exact: true })
  await active
    .getByRole('checkbox', { name: '完成任務：討論登入修正 spec', exact: true })
    .click()
  const completed = page.getByRole('list', {
    name: '當日已完成任務',
    exact: true,
  })
  await expect(
    completed.getByRole('checkbox', {
      name: '恢復任務：討論登入修正 spec',
      exact: true,
    }),
  ).toBeChecked()
  await capture.fill('開發登入修正')
  await capture.press('Enter')
  await expect(
    active.getByRole('textbox', {
      name: '編輯任務標題：開發登入修正',
      exact: true,
    }),
  ).toBeVisible()
  await page.reload()
  await expect(
    completed.getByRole('checkbox', {
      name: '恢復任務：討論登入修正 spec',
      exact: true,
    }),
  ).toBeChecked()
  const saved = await (await request.get('/api/tasks')).json()
  for (const title of ['討論登入修正 spec', '開發登入修正']) {
    expect(
      saved.find((task: { title: string }) => task.title === title)
        .scheduled_date,
    ).toBe('2026-11-04')
  }
})

test('先前未完成移到今日會保留連結與備註', async ({ page, request }) => {
  const task = await (
    await request.post('/api/tasks', {
      data: {
        title: '測試登入功能',
        scheduled_date: '2026-11-01',
        description: '在 staging 確認重新登入',
        links: [{ url: 'https://github.com/example/famo/pull/123' }],
      },
    })
  ).json()
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') })
  await page.goto('/')
  const earlier = page.locator('details.earlier-tasks')
  await earlier.locator('summary').click()
  const oldRow = earlier
    .locator('.task-move-row')
    .filter({ has: page.locator(`[data-task-id="${task.id}"]`) })
  await oldRow.getByRole('button', { name: '移到這天', exact: true }).click()
  const row = page
    .getByRole('list', { name: '當日未完成任務', exact: true })
    .locator(`[data-task-id="${task.id}"]`)
  await expect(row.getByRole('link', { name: 'famo PR #123' })).toBeVisible()
  await expect(row.getByRole('combobox')).toHaveCount(0)
  await row
    .getByRole('button', { name: '任務詳情：測試登入功能', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: '編輯備註' })).toHaveText(
    task.description,
  )
  await expect(
    dialog.getByRole('combobox', { name: /^(?!Project$)/ }),
  ).toHaveCount(0)
  await expect(dialog.getByText('類型資訊', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '編輯備註' }).click()
  await dialog
    .getByRole('textbox', { name: '備註', exact: true })
    .fill('測試通過，接著準備上線')
  await dialog
    .getByRole('textbox', { name: '備註', exact: true })
    .press('Control+Enter')
  await expect(dialog.getByRole('button', { name: '編輯備註' })).toHaveText(
    '測試通過，接著準備上線',
  )
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await row
    .getByRole('checkbox', { name: '完成任務：測試登入功能', exact: true })
    .click()
  const saved = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(saved.scheduled_date).toBe('2026-11-04')
  expect(saved.links).toEqual(task.links)
  expect(saved.completed_at).toBeTruthy()
  expect(saved.description).toBe('測試通過，接著準備上線')
  await page.screenshot({
    path: '/private/tmp/famo-daily-todos-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/private/tmp/famo-daily-todos-mobile.png',
    fullPage: true,
  })
})

test('任務與 Project 列出安排日期，已完成列出當地完成日期，日期版位省略列內日期', async ({
  page,
  request,
}) => {
  const scheduledDate = '2042-07-15'
  await page.clock.setFixedTime(new Date(scheduledDate + 'T12:00:00+08:00'))
  const project = await (
    await request.post('/api/projects', { data: { name: '日期顯示 Project' } })
  ).json()
  const board = await (
    await request.post('/api/boards', {
      data: { name: '日期顯示 Board', project_ids: [project.id] },
    })
  ).json()
  const task = await (
    await request.post('/api/tasks', {
      data: {
        title: '檢查列表日期',
        scheduled_date: scheduledDate,
        project_id: project.id,
      },
    })
  ).json()
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '主要導覽' })
  const row = page.locator(`[data-task-id="${task.id}"]`)
  const date = row.locator('time')
  await expect(row).toBeVisible()
  await expect(date).toHaveCount(0)
  await nav.getByRole('button', { name: board.name, exact: true }).click()
  await expect(row).toBeVisible()
  await expect(date).toHaveCount(0)
  await nav.getByRole('button', { name: '任務列表', exact: true }).click()
  await expect(date).toHaveText(scheduledDate)
  await page
    .getByRole('region', { name: 'Project 導覽' })
    .getByRole('button', { name: project.name, exact: true })
    .click()
  await expect(date).toHaveText(scheduledDate)
  await row.getByRole('checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await expect(date).toHaveText(scheduledDate)
  const saved = await (await request.get(`/api/tasks/${task.id}`)).json()
  const completedDate = new Date(saved.completed_at).toLocaleDateString(
    'sv-SE',
    { timeZone: 'Asia/Taipei' },
  )
  await nav.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(date).toHaveText(completedDate)
  await expect(date).toHaveAttribute('datetime', completedDate)
})
