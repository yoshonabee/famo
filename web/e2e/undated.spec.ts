import { expect, test } from '@playwright/test'
import { setTaskDate } from './date-picker'

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
    ['D', ''],
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
  await expect(section.locator('[data-task-id]')).toHaveCount(4)
  const singleRow = section.locator('.task-move-row').filter({
    has: page.getByRole('textbox', { name: '編輯任務標題：undated-batch D' }),
  })
  await expect(singleRow.getByRole('checkbox')).toHaveCount(1)
  await singleRow.getByRole('button', { name: '移到這天', exact: true }).click()
  await expect(section.locator('[data-task-id]')).toHaveCount(3)
  await expect(
    section.getByRole('button', {
      name: '將選取任務移到這天（0）',
      exact: true,
    }),
  ).toBeDisabled()
  await section
    .getByRole('checkbox', {
      name: '選取任務：undated-batch A',
      exact: true,
    })
    .click()
  await section
    .getByRole('checkbox', {
      name: '選取任務：undated-batch B',
      exact: true,
    })
    .click()
  await section
    .getByRole('button', { name: '將選取任務移到這天（2）', exact: true })
    .click()
  await expect(section.locator('[data-task-id]')).toHaveCount(1)
  await expect(
    page
      .getByRole('list', { name: '當日未完成任務', exact: true })
      .locator('[data-task-id]'),
  ).toHaveCount(3)
  await page.getByLabel('搜尋任務').fill('undated-batch C')
  await section
    .getByRole('checkbox', { name: '全選未指定日期任務', exact: true })
    .click()
  await section
    .getByRole('button', { name: '將選取任務移到這天（1）', exact: true })
    .click()
  await expect(section.locator('[data-task-id]')).toHaveCount(0)
  const saved = await (await request.get('/api/tasks')).json()
  for (const task of created.slice(0, 4))
    expect(
      saved.find((item: { id: string }) => item.id === task.id).scheduled_date,
    ).toBe('2026-11-04')
  expect(
    saved.find((item: { id: string }) => item.id === created[4].id)
      .scheduled_date,
  ).toBe('2026-11-06')
  expect(
    saved.find((item: { id: string }) => item.id === created[5].id)
      .scheduled_date,
  ).toBe('')
  await page.reload()
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await page.getByLabel('搜尋任務').fill('undated-batch')
  await expect(
    page
      .getByRole('list', { name: '當日未完成任務', exact: true })
      .locator('[data-task-id]'),
  ).toHaveCount(4)
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
    .getByRole('button', { name: '將選取任務移到這天（2）', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('任務已被更新')
  await expect(section.locator('[data-task-id]')).toHaveCount(1)
  await expect(
    section.getByRole('checkbox', {
      name: '選取任務：undated-conflict A',
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
    .getByRole('button', { name: '將選取任務移到這天（1）', exact: true })
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
  await page.getByRole('button', { name: '已完成', exact: true }).click()
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
  await setTaskDate(dialog, '2026-11-07')
  await expect(dialog.getByRole('alert')).toContainText('date save failed')
  await expect(dialog.getByRole('button', { name: /^任務日期：/ })).toHaveText(
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
  await expect(
    dialog.getByRole('button', { name: /^任務日期：/ }),
  ).toBeEnabled()
  await expect(dialog.getByRole('button', { name: /^任務日期：/ })).toHaveText(
    '未指定日期',
  )
  const latest = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(latest.scheduled_date).toBe('')
  expect(latest.completed_at).not.toBeNull()
})

for (const sectionKind of ['earlier', 'undated'] as const) {
  test(`手勢選取 ${sectionKind} 任務後可批次移到今日`, async ({
    page,
    request,
  }) => {
    await page.clock.install({ time: new Date('2026-11-03T16:30:00Z') })
    const prefix = `move gesture ${sectionKind}`
    for (const [index, date] of [
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ].entries())
      await request.post('/api/tasks', {
        data: {
          title: `${prefix} ${index}`,
          scheduled_date: sectionKind === 'earlier' ? date : '',
        },
      })
    await page.goto('/')
    await page.getByLabel('搜尋任務').fill(prefix)
    const section = page.locator(`details.${sectionKind}-tasks`)
    await section.locator('summary').click()
    const rows = section.locator('.task-move-row')
    const titles = rows.getByRole('textbox')
    await titles.last().scrollIntoViewIfNeeded()
    const start = (await titles.first().boundingBox())!
    const end = (await titles.last().boundingBox())!
    await page.mouse.move(start.x + 10, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + 10, end.y + end.height / 2, { steps: 10 })
    await page.mouse.up()
    await expect(
      rows.locator('[role="checkbox"][aria-checked="true"]'),
    ).toHaveCount(3)
    await titles.nth(1).click({ modifiers: ['Meta'] })
    await expect(rows.nth(1).getByRole('checkbox')).not.toBeChecked()
    await section
      .getByRole('button', { name: '將選取任務移到這天（2）' })
      .click()
    await expect(rows).toHaveCount(1)
    await expect(
      page
        .getByRole('list', { name: '當日未完成任務', exact: true })
        .locator('[data-task-id]'),
    ).toHaveCount(2)
  })
}
