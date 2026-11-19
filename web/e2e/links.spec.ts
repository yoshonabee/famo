import { expect, test } from '@playwright/test'

test('貼上網址即可附加脈絡，多個 PR 顯示編號，多餘連結展開查看', async ({
  page,
  request,
}) => {
  const task = await (
    await request.post('/api/tasks', {
      data: { title: '測試登入修正', scheduled_date: '2026-11-04' },
    })
  ).json()
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') })
  await page.goto('/')
  const row = page.locator(`[data-task-id="${task.id}"]`)
  await row
    .getByRole('button', { name: '任務詳情：測試登入修正', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  const urls = [
    'https://github.com/example/famo/pull/123',
    'https://github.com/example/famo/pull/124',
    'https://team.slack.com/archives/C123/p456',
  ]
  for (const [index, url] of urls.entries()) {
    await dialog.getByRole('button', { name: '新增連結', exact: true }).click()
    await expect(dialog.getByRole('combobox')).toHaveCount(0)
    await dialog.getByRole('textbox', { name: '連結網址' }).fill(url)
    await dialog.getByRole('button', { name: '加入', exact: true }).click()
    await expect(dialog.locator('.detail-links a')).toHaveCount(index + 1)
  }
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(row.getByRole('link')).toHaveCount(2)
  await expect(row.getByRole('link', { name: 'famo PR #123' })).toHaveAttribute(
    'href',
    urls[0],
  )
  await expect(row.getByRole('link', { name: 'famo PR #124' })).toHaveAttribute(
    'href',
    urls[1],
  )
  await row
    .getByRole('button', { name: '查看其餘 1 個連結：測試登入修正' })
    .click()
  await expect(dialog.getByRole('link', { name: /Slack/ })).toHaveAttribute(
    'href',
    urls[2],
  )
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await page.reload()
  await expect(row.getByRole('link', { name: 'famo PR #123' })).toBeVisible()
  const saved = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(saved.links.map((link: { url: string }) => link.url)).toEqual(urls)
})

test('附加連結失敗或衝突保留網址，確認最新資料後可重試', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const task = await (
    await request.post('/api/tasks', {
      data: { title: '連結草稿保留', scheduled_date: '2026-11-04' },
    })
  ).json()
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') })
  await page.goto('/')
  await page
    .getByRole('button', { name: '任務詳情：連結草稿保留', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '新增連結', exact: true }).click()
  const input = dialog.getByRole('textbox', { name: '連結網址' })
  const url = 'https://github.com/example/famo/pull/125'
  await input.fill(url)
  await page.route(`**/api/tasks/${task.id}/actions`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: '連結儲存失敗' }),
    }),
  )
  await dialog.getByRole('button', { name: '加入', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('連結儲存失敗')
  await expect(input).toHaveValue(url)
  await page.unroute(`**/api/tasks/${task.id}/actions`)
  await request.post(`/api/tasks/${task.id}/actions`, {
    data: {
      op: 'update',
      version: task.version,
      description: 'Agent 補上的備註',
    },
  })
  await dialog.getByRole('button', { name: '加入', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('任務已被更新')
  await expect(input).toHaveValue(url)
  await expect(dialog.getByRole('button', { name: '編輯備註' })).toHaveText(
    'Agent 補上的備註',
  )
  await dialog.getByRole('button', { name: '加入', exact: true }).click()
  await expect(dialog.locator('.detail-links a')).toHaveCount(1)
  const saved = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(saved.description).toBe('Agent 補上的備註')
  expect(saved.links[0].url).toBe(url)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('網址依服務顯示名稱，已完成任務也可移除單筆連結', async ({
  page,
  request,
}) => {
  const entries = [
    ['Claude Artifact', 'https://claude.ai/public/artifacts/example'],
    ['Google Doc', 'https://docs.google.com/document/d/spec/edit'],
    ['Google Slides', 'https://docs.google.com/presentation/d/deck/edit'],
    ['Google Sheets', 'https://docs.google.com/spreadsheets/u/1/d/plan/edit'],
    ['Google Forms', 'https://docs.google.com/forms/d/e/survey/viewform'],
    ['Google Drive', 'https://drive.google.com/file/d/example/view'],
    ['Slack', 'https://team.slack.com/archives/C123/p456'],
  ]
  const task = await (
    await request.post('/api/tasks', {
      data: {
        title: '整理分享連結',
        links: entries.map(([, url]) => ({ url })),
      },
    })
  ).json()
  await request.post(`/api/tasks/${task.id}/actions`, {
    data: { op: 'complete_task', version: task.version },
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^已完成/ }).click()
  const row = page.locator(`[data-task-id="${task.id}"]`)
  await expect(
    row.getByRole('link', { name: 'Claude Artifact', exact: true }),
  ).toBeVisible()
  await expect(
    row.getByRole('link', { name: 'Google Doc', exact: true }),
  ).toBeVisible()
  await row.getByRole('button', { name: '任務詳情：整理分享連結' }).click()
  const dialog = page.getByRole('dialog')
  for (const [label, url] of entries) {
    const link = dialog.locator('.detail-links a').filter({ hasText: url })
    await expect(link.locator('span').first()).toHaveText(label)
    await expect(link).toHaveAttribute('href', url)
  }
  const [, removedUrl] = entries[0]
  await dialog.getByRole('button', { name: `刪除連結：${removedUrl}` }).click()
  await expect(dialog.locator('.detail-links a')).toHaveCount(
    entries.length - 1,
  )
  await expect(dialog.locator(`a[href="${removedUrl}"]`)).toHaveCount(0)
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(
    row.getByRole('link', { name: 'Google Slides', exact: true }),
  ).toBeVisible()
  const saved = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(saved.links).toEqual(entries.slice(1).map(([, url]) => ({ url })))
  expect(saved.completed_at).not.toBeNull()
})
