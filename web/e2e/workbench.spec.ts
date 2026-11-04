import { expect, test } from '@playwright/test'

test('小步驟完成後留在原位，確認等待，再透過 Agent API 回報並完成任務', async ({
  page,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: '完整表單', exact: true }).click()
  const create = page.getByRole('dialog')
  await create.getByLabel('任務名稱').fill('修復登入逾時')
  await create.getByLabel('目標', { exact: true }).fill('登入流程恢復正常')
  await create
    .getByLabel('下一步與子步驟（每行一個）')
    .fill('重現登入問題\n開 PR')
  await create.getByRole('button', { name: '建立任務', exact: true }).click()
  await expect(create).not.toBeVisible()
  const ready = page.locator('.section-ready')
  await ready.getByRole('checkbox', { name: '完成步驟：重現登入問題' }).click()
  await expect(ready.getByText('這一步完成了。')).toBeVisible()
  // 完成狀態已儲存，但卡片仍在原區塊等待確認。
  let tasks = await (await request.get('/api/tasks')).json()
  let task = tasks.find((t: { title: string }) => t.title === '修復登入逾時')
  expect(task.steps[0].completed_at).toBeTruthy()
  expect(task.completed_at).toBeNull()
  await ready.getByLabel('下一步', { exact: true }).fill('開 PR 並附上測試結果')
  await ready.getByLabel('等待原因（選填）').fill('AI 完成修復')
  await ready.getByRole('button', { name: '確認並繼續' }).click()
  const waiting = page.locator('.section-waiting')
  await expect(
    waiting.getByRole('button', {
      name: '所屬任務：修復登入逾時',
      exact: true,
    }),
  ).toBeVisible()
  await page.reload()
  await expect(waiting.getByText('等待 AI 完成修復')).toBeVisible()
  tasks = await (await request.get('/api/tasks')).json()
  task = tasks.find((t: { title: string }) => t.title === '修復登入逾時')
  const context = await (await request.get(`/tasks/${task.id}/context`)).json()
  expect(context.goal).toBe('登入流程恢復正常')
  const response = await request.post(`/tasks/${task.id}/actions`, {
    data: {
      op: 'complete_step',
      version: context.version,
      source: 'agent:e2e',
      step_id: context.steps[1].id,
      next_step: '查看 CI 結果',
      stage: 'PR review',
      waiting_reason: 'CI 執行中',
      review_at: new Date(Date.now() - 60_000).toISOString(),
      links: [
        { type: 'GitHub PR', url: 'https://github.com/example/repo/pull/1' },
      ],
    },
  })
  expect(response.status()).toBe(200)
  const conflict = await request.post(`/tasks/${task.id}/actions`, {
    data: { op: 'resume', version: context.version },
  })
  expect(conflict.status()).toBe(409)
  await page.reload()
  const review = page.locator('.section-review')
  await expect(
    review.getByRole('textbox', {
      name: '編輯步驟標題：查看 CI 結果',
      exact: true,
    }),
  ).toHaveValue('查看 CI 結果')
  await expect(review.getByRole('link', { name: 'GitHub PR' })).toHaveAttribute(
    'href',
    'https://github.com/example/repo/pull/1',
  )
  await page.screenshot({
    path: '/private/tmp/famo-desktop.png',
    fullPage: true,
  })
  await review
    .getByRole('button', { name: '所屬任務：修復登入逾時', exact: true })
    .click()
  const detail = page.getByRole('dialog')
  await expect(detail.getByText('agent:e2e', { exact: false })).toBeVisible()
  await expect(
    detail.getByText('登入流程恢復正常', { exact: true }),
  ).toBeVisible()
  await detail.getByRole('button', { name: '完成整件任務' }).click()
  await expect(detail.getByText('整件事都完成了？')).not.toBeVisible()
  await detail.getByRole('button', { name: '關閉', exact: true }).click()
  await page.getByRole('button', { name: '已完成' }).click()
  await expect(
    page
      .locator('.task-row')
      .filter({
        has: page.getByRole('button', {
          name: '任務詳情：修復登入逾時',
          exact: true,
        }),
      })
      .getByText('已完成 ·', { exact: false }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('手機版可建立與編輯任務，頁面沒有水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '完整表單', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('任務名稱').fill('確認專案需求')
  await dialog.getByLabel('任務類型').selectOption('communication')
  await dialog.getByRole('button', { name: '建立任務', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page
    .getByRole('button', { name: '任務詳情：確認專案需求', exact: true })
    .click()
  await dialog.getByRole('button', { name: '編輯內容', exact: true }).click()
  await dialog.getByLabel('背景脈絡').fill('等待同事確認規格')
  // 同步到新版本時保留草稿，但不能用舊內容配新版本寫回。
  await dialog.getByLabel('流程階段').selectOption('已送出')
  await expect(dialog.getByRole('button', { name: '儲存內容' })).toBeDisabled()
  await expect(dialog.getByLabel('背景脈絡')).toHaveValue('等待同事確認規格')
  await dialog.getByRole('button', { name: '重新載入內容' }).click()
  await expect(dialog.getByLabel('背景脈絡')).toHaveValue('')
  await dialog.getByLabel('背景脈絡').fill('等待同事確認規格')
  await dialog.getByRole('button', { name: '儲存內容' }).click()
  await expect(
    dialog.getByText('等待同事確認規格', { exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: '重新載入下一步' }).click()
  await dialog.getByLabel('下一步', { exact: true }).fill('草擬問題清單')
  await dialog.getByRole('button', { name: '確認並繼續' }).click()
  await expect(dialog.getByText('草擬問題清單', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/private/tmp/famo-mobile.png',
    fullPage: true,
  })
})
