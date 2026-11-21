import { expect, test, type Locator } from '@playwright/test'

async function expectCentered(dialog: Locator) {
  await expect(dialog).toBeVisible()
  const offset = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      x: box.x + box.width / 2 - innerWidth / 2,
      y: box.y + box.height / 2 - innerHeight / 2,
    }
  })
  expect(Math.abs(offset.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(offset.y)).toBeLessThanOrEqual(1)
}

test('⌘D 收合與展開側邊欄，⌘K 從其他頁面或日期返回今日', async ({ page }) => {
  await page.goto('/')
  const today = await page.locator('h1 time').getAttribute('datetime')

  await page.keyboard.press('Meta+d')
  const expand = page.getByRole('button', { name: '展開側邊欄' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.sidebar')).toHaveCSS('width', '56px')
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '任務', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Meta+k')
  await expect(page.locator('h1 time')).toHaveAttribute('datetime', today!)

  await page.getByRole('button', { name: '前一天' }).click()
  await expect(page.locator('h1 time')).not.toHaveAttribute('datetime', today!)
  await page.keyboard.press('Meta+k')
  await expect(page.locator('h1 time')).toHaveAttribute('datetime', today!)

  await page.keyboard.press('Meta+d')
  await expect(
    page.getByRole('button', { name: '收合側邊欄' }),
  ).toHaveAttribute('aria-expanded', 'true')
})

test('⌘T 浮窗沿用目前日期，儲存失敗可重試且不清除清單輸入', async ({
  page,
}) => {
  let attempts = 0
  await page.route('**/api/tasks', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().title === '浮窗新增測試' &&
      ++attempts === 1
    ) {
      await route.fulfill({ status: 500, json: { error: '暫時無法儲存' } })
      return
    }
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: '前一天' }).click()
  const date = await page.locator('h1 time').getAttribute('datetime')
  const inline = page.getByRole('textbox', { name: '快速新增任務名稱' })
  await inline.fill('保留原本的輸入')
  await page.keyboard.press('Meta+t')
  const dialog = page.getByRole('dialog', { name: '快速新增任務' })
  const input = dialog.getByRole('textbox', { name: '快速新增任務名稱' })
  await expect(input).toBeFocused()
  await expectCentered(dialog)
  await expect(
    dialog.getByRole('button', { name: `任務日期 ${date}` }),
  ).toBeVisible()
  await input.fill('- [ ] 浮窗新增測試')
  await input.press('Enter')
  await expect(dialog.getByRole('alert')).toContainText('暫時無法儲存')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tasks') &&
      response.request().method() === 'POST' &&
      response.ok(),
  )
  await dialog.getByRole('button', { name: '重試' }).click()
  expect(await (await saved).json()).toMatchObject({
    title: '浮窗新增測試',
    scheduled_date: date,
  })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(inline).toBeFocused()
  await expect(inline).toHaveValue('保留原本的輸入')
  await expect(page.getByLabel('編輯任務標題：浮窗新增測試')).toBeVisible()
})

test('⌘T 從任務列表開啟時預設今天，日期可改選並儲存', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('/')
  const today = await page.locator('h1 time').getAttribute('datetime')
  await page.getByRole('button', { name: '前一天' }).click()
  await page.getByRole('button', { name: '任務列表' }).click()
  await page.keyboard.press('Meta+t')
  const dialog = page.getByRole('dialog', { name: '快速新增任務' })
  await expectCentered(dialog)
  await expect(dialog.getByRole('button', { name: '關閉' })).toHaveCount(0)
  const date = dialog.getByRole('button', { name: `任務日期 ${today}` })
  const calendar = dialog.getByRole('dialog', { name: '選擇日期' })
  await date.click()
  await expect(calendar.getByRole('button', { name: today! })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(calendar).toBeHidden()
  await expect(date).toBeFocused()
  await date.click()
  await page.keyboard.press('ArrowRight')
  const next = await calendar
    .locator('[data-date]:focus')
    .getAttribute('data-date')
  expect(next).not.toBe(today)
  await page.keyboard.press('Enter')
  await expect(calendar).toBeHidden()
  await expect(
    dialog.getByRole('button', { name: `任務日期 ${next}` }),
  ).toBeVisible()
  const input = dialog.getByRole('textbox', { name: '快速新增任務名稱' })
  await expect(input).toBeFocused()
  await input.fill('浮窗選擇任務日期')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tasks') &&
      response.request().method() === 'POST' &&
      response.ok(),
  )
  await input.press('Enter')
  expect(await (await saved).json()).toMatchObject({
    title: '浮窗選擇任務日期',
    scheduled_date: next,
  })
  await page.mouse.click(8, 8)
  await expect(dialog).toBeHidden()
  await page.keyboard.press('Meta+t')
  await expect(date).toBeVisible()
})

test('⌘F 浮窗使用清單的搜尋條件，Enter 返回篩選後的今日清單', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const date = await page.locator('h1 time').getAttribute('datetime')
  for (const title of ['浮窗搜尋：符合', '浮窗搜尋：略過']) {
    await request.post('/api/tasks', { data: { title, scheduled_date: date } })
  }
  await page.reload()
  const inline = page.getByRole('textbox', { name: '搜尋任務' })
  await inline.fill('浮窗搜尋：')
  await expect(page.getByLabel('編輯任務標題：浮窗搜尋：略過')).toBeVisible()

  await page.keyboard.press('Meta+f')
  const dialog = page.getByRole('dialog', { name: '搜尋任務' })
  const input = dialog.getByRole('textbox', { name: '搜尋任務' })
  await expect(input).toBeFocused()
  await expectCentered(dialog)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectCentered(dialog)
  await expect(input).toHaveValue('浮窗搜尋：')
  await input.fill('浮窗搜尋：符合')
  await input.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(inline).toBeFocused()
  await expect(inline).toHaveValue('浮窗搜尋：符合')
  await expect(page.getByLabel('編輯任務標題：浮窗搜尋：符合')).toBeVisible()
  await expect(page.getByLabel('編輯任務標題：浮窗搜尋：略過')).toHaveCount(0)
})

test('⌘⇧F 從今日和設定搜尋所有日期的任務並開啟詳情', async ({
  page,
  request,
}) => {
  const title = '封存前確認文件'
  const created = await request.post('/api/tasks', {
    data: { title, scheduled_date: '2001-01-02' },
  })
  expect(created.ok()).toBeTruthy()
  const task = await created.json()
  const updated = await request.post(`/api/tasks/${task.id}/actions`, {
    data: {
      op: 'update',
      version: task.version,
      description: 'Global-Search-Notes',
    },
  })
  expect(updated.ok()).toBeTruthy()
  const completed = await request.post(`/api/tasks/${task.id}/actions`, {
    data: { op: 'complete_task', version: (await updated.json()).version },
  })
  expect(completed.ok()).toBeTruthy()
  await page.goto('/')
  const local = page.getByRole('textbox', { name: '搜尋任務' })
  await local.fill('保留篩選')
  await page.keyboard.press('Meta+Shift+f')
  const search = page.getByRole('dialog', { name: '搜尋所有任務' })
  const input = search.getByRole('textbox')
  await expect(input).toBeFocused()
  await input.fill('global-search-notes')
  const result = search.getByRole('button', { name: new RegExp(title) })
  await expect(result).toContainText('已完成')
  await result.click()
  const detail = page.getByRole('dialog', { name: title })
  await expect(detail).toBeVisible()
  await detail.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(local).toHaveValue('保留篩選')

  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.keyboard.press('Meta+Shift+f')
  await input.fill('global-search-no-match')
  await expect(search.getByRole('status')).toHaveText('沒有符合的任務')
  await input.fill(title)
  await input.press('Enter')
  await expect(detail).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation', { name: '設定分類' })).toBeVisible()
})
