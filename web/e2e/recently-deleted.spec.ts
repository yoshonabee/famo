import { expect, test } from '@playwright/test'

test('最近刪除緊接在側欄底部的設定之前', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('.sidebar > .sidebar-footer:last-child')
  await expect(footer.getByRole('button')).toHaveText([
    '統計',
    '最近刪除',
    '設定',
  ])
  const recentlyDeleted = footer.getByRole('button', { name: '最近刪除' })
  const settings = footer.getByRole('button', { name: '設定' })
  const recentlyDeletedBox = (await recentlyDeleted.boundingBox())!
  const settingsBox = (await settings.boundingBox())!
  expect(recentlyDeletedBox.y + recentlyDeletedBox.height).toBeLessThanOrEqual(
    settingsBox.y,
  )

  await page.getByRole('button', { name: '收合側邊欄' }).click()
  await recentlyDeleted.click()
  await expect(recentlyDeleted).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: '最近刪除' })).toBeVisible()

  await page.getByRole('button', { name: '展開側邊欄' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(recentlyDeleted).toBeInViewport()
  await settings.click()
  await expect(settings).toHaveAttribute('aria-current', 'page')
  await recentlyDeleted.click()
  await expect(recentlyDeleted).toHaveAttribute('aria-current', 'page')
})

test('最近刪除可搜尋與還原，並保留原日期和完成狀態', async ({
  page,
  request,
}) => {
  const task = await (
    await request.post('/api/tasks', {
      data: {
        title: '準備專案交接',
        description: '交接文件已核對',
        scheduled_date: '2026-11-18',
      },
    })
  ).json()
  expect(
    (
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: { op: 'complete_task', version: task.version },
      })
    ).ok(),
  ).toBe(true)

  await page.goto('/')
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  const title = page.getByRole('textbox', {
    name: '編輯任務標題：準備專案交接',
  })
  await title.fill('')
  await title.press('Backspace')
  await expect(title).not.toBeVisible()
  expect((await request.get(`/api/tasks/${task.id}`)).status()).toBe(404)

  await page.getByRole('button', { name: '最近刪除', exact: true }).click()
  const list = page.getByRole('list', { name: '最近刪除的任務' })
  const row = list.getByRole('listitem').filter({ hasText: task.title })
  await expect(row).toContainText('任務日期 2026-11-18')
  await expect(row).toContainText('已完成')
  const search = page.getByRole('textbox', { name: '搜尋任務' })
  await search.fill('完全無關的文字')
  await expect(row).not.toBeVisible()
  await search.fill('交接文件')
  await expect(row).toBeVisible()
  await search.clear()

  const conflict = await request.post(`/api/tasks/${task.id}/restore`, {
    data: { version: task.version },
  })
  expect(conflict.status()).toBe(409)
  await page.setViewportSize({ width: 390, height: 844 })
  const restore = row.getByRole('button', { name: '還原任務：準備專案交接' })
  await expect(restore).toBeInViewport()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  const titleBox = await row
    .getByText(task.title, { exact: true })
    .boundingBox()
  expect(titleBox!.width).toBeGreaterThan(100)
  await restore.click()
  await expect(row).not.toBeVisible()
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    '已還原「準備專案交接」',
  )
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(title).toHaveValue(task.title)
  const restored = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(restored).toMatchObject({
    description: task.description,
    scheduled_date: task.scheduled_date,
    deleted_at: null,
    version: task.version + 3,
  })
  expect(restored.completed_at).toBeTruthy()
})
