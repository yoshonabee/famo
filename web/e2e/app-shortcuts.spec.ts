import { expect, test } from '@playwright/test'

test('⌘D 收合與展開側邊欄，⌘K 從其他頁面或日期返回今日', async ({ page }) => {
  await page.goto('/')
  const today = await page.locator('h1 time').getAttribute('datetime')

  await page.keyboard.press('Meta+d')
  const expand = page.getByRole('button', { name: '展開側邊欄' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.sidebar')).toHaveCSS('width', '56px')
  await page.getByRole('button', { name: '任務列表' }).click()
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
  await expect(dialog).toContainText(`任務日期 ${date}`)
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
  await expect(input).toHaveValue('浮窗搜尋：')
  await input.fill('浮窗搜尋：符合')
  await input.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(inline).toBeFocused()
  await expect(inline).toHaveValue('浮窗搜尋：符合')
  await expect(page.getByLabel('編輯任務標題：浮窗搜尋：符合')).toBeVisible()
  await expect(page.getByLabel('編輯任務標題：浮窗搜尋：略過')).toHaveCount(0)
})
