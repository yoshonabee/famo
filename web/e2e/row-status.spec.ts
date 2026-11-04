import { expect, test } from '@playwright/test'
import type { Settings } from '../src/lib/api'

test('任務列點狀態 chip 直接切換，儲存失敗及版本衝突不覆寫資料', async ({
  page,
  request,
}) => {
  const cfg: Settings = await (await request.get('/api/settings')).json()
  cfg.workflows.push({
    id: 'row-status',
    name: '列內狀態驗收',
    color: '#F4B8CB',
    disabled: false,
    default_stage: 'ready',
    stages: [
      { id: 'ready', name: '準備好了', color: '#F4B8CB', disabled: false },
      { id: 'doing', name: '進行中', color: '#ADE0D2', disabled: false },
      { id: 'retired', name: '已停用階段', color: '#CFC1F0', disabled: true },
    ],
  })
  expect((await request.post('/api/settings', { data: cfg })).status()).toBe(
    200,
  )
  const task = await (
    await request.post('/api/tasks', {
      data: {
        title: '列表直接切換狀態',
        type: 'row-status',
        description: '保留描述',
      },
    })
  ).json()
  await page.goto('/')
  const row = page.locator(`[data-task-id="${task.id}"]`)
  const select = row.getByRole('combobox', {
    name: '變更狀態：列表直接切換狀態',
    exact: true,
  })
  await expect(select).toHaveValue('ready')
  await expect(select.locator('option')).toHaveCount(2)
  await select.selectOption('doing')
  await expect(select).toHaveValue('doing')
  await expect(select).toHaveCSS('background-color', 'rgb(173, 224, 210)')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(row.locator('input.todo-title')).toHaveValue(task.title)
  await page.reload()
  await expect(select).toHaveValue('doing')
  let current = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(current.version).toBe(task.version + 1)
  expect(current.description).toBe(task.description)
  expect(current.completed_at).toBeNull()
  await page.route(`**/api/tasks/${task.id}/actions`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: '狀態儲存失敗' }),
    }),
  )
  await select.selectOption('ready')
  await expect(page.getByRole('alert')).toContainText('狀態儲存失敗')
  await expect(select).toHaveValue('doing')
  await page.unroute(`**/api/tasks/${task.id}/actions`)
  await request.post(`/api/tasks/${task.id}/actions`, {
    data: {
      op: 'update',
      version: current.version,
      description: '外部更新的描述',
    },
  })
  await select.selectOption('ready')
  await expect(page.getByRole('alert')).toContainText('任務已被更新')
  await expect(select).toHaveValue('doing')
  current = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(current.description).toBe('外部更新的描述')
  await page.setViewportSize({ width: 390, height: 844 })
  await select.selectOption('ready')
  await expect(select).toHaveValue('ready')
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/tasks/${task.id}`)).json()).stage,
    )
    .toBe('ready')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await row
    .getByRole('checkbox', { name: '完成任務：列表直接切換狀態', exact: true })
    .click()
  await page.getByRole('button', { name: '已完成', exact: false }).click()
  await expect(row.getByRole('combobox')).toHaveCount(0)
  await expect(row.getByText('已完成 ·', { exact: false })).toBeVisible()
})
