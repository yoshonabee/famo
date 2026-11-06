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
  await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(3)
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

test('先前未完成移到今日會保留連結與備註，舊分類資料仍保存', async ({
  page,
  request,
}) => {
  const originalSettings = await (await request.get('/api/settings')).json()
  const task = await (
    await request.post('/api/tasks', {
      data: {
        title: '測試登入功能',
        scheduled_date: '2026-11-01',
        description: '在 staging 確認重新登入',
        type: 'development',
        stage: 'PR review',
        priority: 0,
        metadata: { repo: 'example/famo' },
        links: [
          { type_id: 'pr', url: 'https://github.com/example/famo/pull/123' },
        ],
      },
    })
  ).json()
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') })
  await page.goto('/')
  const earlier = page.locator('details.earlier-tasks')
  await earlier.locator('summary').click()
  const oldRow = earlier
    .locator('.earlier-task')
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
  await expect(dialog.getByRole('combobox')).toHaveCount(0)
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
  expect(saved.metadata).toEqual(task.metadata)
  expect(saved.type).toBe(task.type)
  expect(saved.stage).toBe(task.stage)
  expect(saved.priority).toBe(task.priority)
  expect(saved.completed_at).toBeTruthy()
  expect(await (await request.get('/api/settings')).json()).toEqual(
    originalSettings,
  )
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
