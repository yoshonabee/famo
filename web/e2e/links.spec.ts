import { expect, test } from '@playwright/test'
import type { Settings, Task } from '../src/lib/api'

test('連結種類可於獨立頁設定，同一任務可保留多個 PR', async ({
  page,
  request,
}) => {
  const original: Settings = await (await request.get('/api/settings')).json()
  const task: Task = await (
    await request.post('/api/tasks', { data: { title: '多個 PR 連結驗收' } })
  ).json()
  const urls = [
    'https://github.com/example/repo/pull/10',
    'https://github.com/example/repo/pull/11',
    'https://example.com/design',
  ]
  try {
    await page.goto('/')
    await page
      .getByRole('button', { name: '任務詳情：多個 PR 連結驗收', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    for (let i = 0; i < 2; i++) {
      await dialog
        .getByRole('button', { name: '新增連結', exact: true })
        .click()
      await dialog
        .getByRole('combobox', { name: '連結種類', exact: true })
        .selectOption('pr')
      await dialog.getByLabel('URL', { exact: true }).fill(urls[i])
      await dialog.getByRole('button', { name: '加入', exact: true }).click()
      await expect(dialog.locator('.detail-links a')).toHaveCount(i + 1)
    }
    await expect(
      dialog.locator('.detail-links a > span:first-child'),
    ).toHaveText(['GitHub PR', 'GitHub PR'])
    await dialog.getByRole('button', { name: '關閉', exact: true }).click()
    await page
      .getByRole('button', { name: '連結種類設定', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: '連結種類設定', exact: true }),
    ).toBeVisible()
    const kinds = page.getByRole('group', { name: '連結種類', exact: true })
    const pr = kinds.locator('.option-row').first()
    await pr.getByRole('textbox', { name: /選項名稱/ }).fill('Pull Request')
    await kinds
      .getByRole('button', { name: '新增連結種類選項', exact: true })
      .click()
    const design = kinds.locator('.option-row').last()
    await design.getByRole('textbox', { name: /選項名稱/ }).fill('設計稿')
    await design.getByLabel('預設', { exact: true }).check()
    await page
      .getByRole('button', { name: '儲存選項設定', exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText('設定已儲存。')
    await page.reload()
    await page
      .getByRole('button', { name: '連結種類設定', exact: true })
      .click()
    await expect(design.getByRole('textbox', { name: /選項名稱/ })).toHaveValue(
      '設計稿',
    )
    await expect(design.getByLabel('預設', { exact: true })).toBeChecked()
    const config: Settings = await (await request.get('/api/settings')).json()
    const designID = config.link_types.find(
      (kind) => kind.name === '設計稿',
    )!.id
    await page.getByRole('button', { name: '任務列表', exact: false }).click()
    await page
      .getByRole('button', { name: '任務詳情：多個 PR 連結驗收', exact: true })
      .click()
    await expect(
      dialog.locator('.detail-links a > span:first-child'),
    ).toHaveText(['Pull Request', 'Pull Request'])
    await dialog.getByRole('button', { name: '新增連結', exact: true }).click()
    await expect(
      dialog.getByRole('combobox', { name: '連結種類', exact: true }),
    ).toHaveValue(designID)
    await dialog.getByLabel('URL', { exact: true }).fill(urls[2])
    await dialog.getByRole('button', { name: '加入', exact: true }).click()
    await expect(dialog.locator('.detail-links a')).toHaveCount(3)
    await dialog.getByRole('button', { name: '關閉', exact: true }).click()
    await page
      .getByRole('button', { name: '連結種類設定', exact: true })
      .click()
    await pr.getByLabel('停用', { exact: true }).check()
    await page
      .getByRole('button', { name: '儲存選項設定', exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText('設定已儲存。')
    await page.getByRole('button', { name: '任務列表', exact: false }).click()
    await page
      .getByRole('button', { name: '任務詳情：多個 PR 連結驗收', exact: true })
      .click()
    await dialog.getByRole('button', { name: '新增連結', exact: true }).click()
    await expect(
      dialog
        .getByRole('combobox', { name: '連結種類', exact: true })
        .locator('option[value="pr"]'),
    ).toHaveCount(0)
    await expect(dialog.locator('.detail-links a')).toHaveCount(3)
    await dialog.getByRole('button', { name: '關閉', exact: true }).click()
    await page
      .getByRole('button', { name: '連結種類設定', exact: true })
      .click()
    await kinds
      .getByRole('button', { name: '刪除Pull Request', exact: true })
      .click()
    await kinds.getByRole('button', { name: '刪除設計稿', exact: true }).click()
    await page
      .getByRole('button', { name: '儲存選項設定', exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText('設定已儲存。')
    const saved: Task = await (
      await request.get(`/api/tasks/${task.id}`)
    ).json()
    expect(saved.links.map((link) => link.url)).toEqual(urls)
    expect(saved.links.map((link) => link.type_id)).toEqual([
      'issue',
      'issue',
      'issue',
    ])
    await page.setViewportSize({ width: 375, height: 812 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  } finally {
    const latest: Settings = await (await request.get('/api/settings')).json()
    latest.link_types = original.link_types
    latest.default_link_type = original.default_link_type
    expect(
      (await request.post('/api/settings', { data: latest })).status(),
    ).toBe(200)
    const current: Task = await (
      await request.get(`/api/tasks/${task.id}`)
    ).json()
    await request.post(`/api/tasks/${task.id}/actions`, {
      data: { op: 'delete_item', version: current.version },
    })
  }
})

test('完整表單可新增與移除多筆連結，建立失敗保留草稿，連結維持無配色', async ({
  page,
  request,
}) => {
  const original: Settings = await (await request.get('/api/settings')).json()
  const config = { ...original, default_link_type: 'slack' }
  expect((await request.post('/api/settings', { data: config })).status()).toBe(
    200,
  )
  const title = '完整表單多個 PR 驗收'
  const urls = [
    'https://github.com/example/repo/pull/101',
    'https://github.com/example/repo/pull/102',
  ]
  try {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await page.getByRole('button', { name: '新增任務', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('任務名稱').fill(title)
    await dialog.getByLabel('描述', { exact: true }).fill('連結與任務一起建立')
    await expect(dialog.getByLabel('等待原因（選填）')).toHaveCount(0)
    for (let i = 0; i < 2; i++) {
      await dialog
        .getByRole('button', { name: '新增連結', exact: true })
        .click()
      const kind = dialog.getByRole('combobox', {
        name: `連結種類 ${i + 1}`,
        exact: true,
      })
      await expect(kind).toHaveValue('slack')
      await kind.selectOption('pr')
      await expect(kind).not.toHaveAttribute('style', /background-color/)
      await dialog.getByLabel(`URL ${i + 1}`, { exact: true }).fill(urls[i])
    }
    await dialog.getByRole('button', { name: '新增連結', exact: true }).click()
    await dialog
      .getByLabel('URL 3', { exact: true })
      .fill('https://example.com/remove-me')
    await dialog
      .getByRole('button', { name: '移除連結 3', exact: true })
      .click()
    await expect(
      dialog.getByRole('group', { name: '連結 3', exact: true }),
    ).toHaveCount(0)
    await page.screenshot({ path: '/private/tmp/famo-create-links-mobile.png' })
    let fail = true
    await page.route('**/api/tasks', (route) => {
      if (route.request().method() === 'POST' && fail) {
        fail = false
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: '暫時無法建立' }),
        })
      }
      return route.continue()
    })
    await dialog.getByRole('button', { name: '建立任務', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('暫時無法建立')
    await expect(dialog.getByLabel('任務名稱')).toHaveValue(title)
    for (let i = 0; i < 2; i++)
      await expect(
        dialog.getByLabel(`URL ${i + 1}`, { exact: true }),
      ).toHaveValue(urls[i])
    await dialog.getByRole('button', { name: '建立任務', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    const tasks: Task[] = await (await request.get('/api/tasks')).json()
    const task = tasks.find((task) => task.title === title)!
    expect(task.links.map((link) => link.type_id)).toEqual(['pr', 'pr'])
    expect(task.links.map((link) => link.url)).toEqual(urls)
    const row = page.locator(`[data-task-id="${task.id}"]`)
    await expect(
      row.getByRole('link', { name: 'GitHub PR', exact: true }),
    ).toHaveCount(2)
    await expect(
      row.getByRole('link', { name: 'GitHub PR', exact: true }).first(),
    ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await row
      .getByRole('button', { name: `任務詳情：${title}`, exact: true })
      .click()
    await expect(dialog.locator('.detail-links .task-chip')).toHaveCount(0)
    await expect(
      dialog.locator('.detail-links a > span:first-child'),
    ).toHaveText(['GitHub PR', 'GitHub PR'])
    await expect(
      dialog.getByRole('heading', { name: '等待與提醒', exact: true }),
    ).toHaveCount(0)
    await dialog.getByRole('button', { name: '關閉', exact: true }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  } finally {
    const latest: Settings = await (await request.get('/api/settings')).json()
    latest.default_link_type = original.default_link_type
    expect(
      (await request.post('/api/settings', { data: latest })).status(),
    ).toBe(200)
    const tasks: Task[] = await (await request.get('/api/tasks')).json()
    const task = tasks.find((task) => task.title === title)
    if (task)
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: { op: 'delete_item', version: task.version },
      })
  }
})
