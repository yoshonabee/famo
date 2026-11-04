import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Taipei' })

test('未指定日期支援多選、搜尋後全選與批次安排到當地今日', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date('2026-11-03T16:30:00Z') })
  const created = []
  for (const [suffix, date] of [
    ['A', ''],
    ['B', ''],
    ['C', ''],
    ['已排程', '2026-11-06'],
    ['已完成', ''],
  ]) {
    const task = await (
      await request.post('/api/tasks', {
        data: { title: `undated-batch ${suffix}`, scheduled_date: date },
      })
    ).json()
    created.push(task)
    if (suffix === '已完成')
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: { op: 'complete_task', version: task.version },
      })
  }
  await page.goto('/')
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await page.getByLabel('搜尋任務').fill('undated-batch')
  const section = page.locator('details.undated-tasks')
  await expect(section).not.toHaveAttribute('open')
  await section.locator('summary').click()
  await expect(section.locator('[data-task-id]')).toHaveCount(3)
  await expect(
    section.getByRole('button', { name: '安排到今日（0）', exact: true }),
  ).toBeDisabled()
  await section
    .getByRole('checkbox', {
      name: '選取未指定日期任務：undated-batch A',
      exact: true,
    })
    .click()
  await section
    .getByRole('checkbox', {
      name: '選取未指定日期任務：undated-batch B',
      exact: true,
    })
    .click()
  await section
    .getByRole('button', { name: '安排到今日（2）', exact: true })
    .click()
  await expect(section.locator('[data-task-id]')).toHaveCount(1)
  await expect(
    page
      .getByRole('list', { name: '當日未完成任務', exact: true })
      .locator('[data-task-id]'),
  ).toHaveCount(2)
  await page.getByLabel('搜尋任務').fill('undated-batch C')
  await section
    .getByRole('checkbox', { name: '全選未指定日期任務', exact: true })
    .click()
  await section
    .getByRole('button', { name: '安排到今日（1）', exact: true })
    .click()
  await expect(section.locator('[data-task-id]')).toHaveCount(0)
  const saved = await (await request.get('/api/tasks')).json()
  for (const task of created.slice(0, 3))
    expect(
      saved.find((item: { id: string }) => item.id === task.id).scheduled_date,
    ).toBe('2026-11-04')
  expect(
    saved.find((item: { id: string }) => item.id === created[3].id)
      .scheduled_date,
  ).toBe('2026-11-06')
  expect(
    saved.find((item: { id: string }) => item.id === created[4].id)
      .scheduled_date,
  ).toBe('')
  await page.reload()
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await page.getByLabel('搜尋任務').fill('undated-batch')
  await expect(
    page
      .getByRole('list', { name: '當日未完成任務', exact: true })
      .locator('[data-task-id]'),
  ).toHaveCount(3)
  await page.getByRole('button', { name: '後一天', exact: true }).click()
  await expect(page.locator('details.undated-tasks')).toHaveCount(0)
})

test('批次安排遇到版本衝突，失敗項目保留且可重試，手機不溢出', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.install({ time: new Date('2026-11-03T16:30:00Z') })
  const created = []
  for (const suffix of ['A', 'B'])
    created.push(
      await (
        await request.post('/api/tasks', {
          data: { title: `undated-conflict ${suffix}` },
        })
      ).json(),
    )
  await page.goto('/')
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await page.getByLabel('搜尋任務').fill('undated-conflict')
  const section = page.locator('details.undated-tasks')
  await section.locator('summary').click()
  await section
    .getByRole('checkbox', { name: '全選未指定日期任務', exact: true })
    .click()
  await request.post(`/api/tasks/${created[0].id}/actions`, {
    data: {
      op: 'update',
      version: created[0].version,
      description: 'external update',
    },
  })
  await section
    .getByRole('button', { name: '安排到今日（2）', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('任務已被更新')
  await expect(section.locator('[data-task-id]')).toHaveCount(1)
  await expect(
    section.getByRole('checkbox', {
      name: '選取未指定日期任務：undated-conflict A',
      exact: true,
    }),
  ).toBeChecked()
  await expect(
    page
      .getByRole('list', { name: '當日未完成任務', exact: true })
      .locator('[data-task-id]'),
  ).toHaveCount(1)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await section
    .getByRole('button', { name: '安排到今日（1）', exact: true })
    .click()
  await expect(section.locator('[data-task-id]')).toHaveCount(0)
})

test('詳細頁日期自動儲存與清除，失敗保留選擇並可重試，已完成任務也適用', async ({
  page,
  request,
}) => {
  const task = await (
    await request.post('/api/tasks', {
      data: { title: 'undated-auto-save', scheduled_date: '2026-11-04' },
    })
  ).json()
  await request.post(`/api/tasks/${task.id}/actions`, {
    data: { op: 'complete_task', version: task.version },
  })
  await page.goto('/')
  await page.getByRole('button', { name: '已完成', exact: false }).click()
  await page
    .getByRole('button', { name: '任務詳情：undated-auto-save', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: /^(儲存|取消)$/ }),
  ).toHaveCount(0)
  await page.route(
    `**/api/tasks/${task.id}/actions`,
    (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'date save failed' }),
      }),
    { times: 1 },
  )
  await dialog.getByLabel('任務日期', { exact: true }).fill('2026-11-07')
  await expect(dialog.getByRole('alert')).toContainText('date save failed')
  await expect(dialog.getByLabel('任務日期', { exact: true })).toHaveValue(
    '2026-11-07',
  )
  expect(
    (await (await request.get(`/api/tasks/${task.id}`)).json()).scheduled_date,
  ).toBe('2026-11-04')
  const saved = page.waitForResponse(
    (res) =>
      res.url().endsWith(`/api/tasks/${task.id}/actions`) &&
      res.status() === 200,
  )
  await dialog.getByRole('button', { name: '重試', exact: true }).click()
  await saved
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  expect(
    (await (await request.get(`/api/tasks/${task.id}`)).json()).scheduled_date,
  ).toBe('2026-11-07')
  await dialog.getByRole('button', { name: '清除日期', exact: true }).click()
  await expect(dialog.getByLabel('任務日期', { exact: true })).toBeEnabled()
  await expect(dialog.getByLabel('任務日期', { exact: true })).toHaveValue('')
  const latest = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(latest.scheduled_date).toBe('')
  expect(latest.completed_at).not.toBeNull()
})
