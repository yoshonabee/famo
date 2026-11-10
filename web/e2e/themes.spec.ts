import { expect, test } from '@playwright/test'

test('設定提供 12 款主題，切換立即生效並在重開後保留', async ({
  page,
  request,
}) => {
  const settings = await (await request.get('/api/settings')).json()
  const tasks = await (await request.get('/api/tasks')).json()
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(13)
  await expect(
    page.getByRole('radio', { name: '苔綠', exact: true }),
  ).toBeChecked()
  await expect(page.getByRole('textbox', { name: '搜尋任務' })).toBeHidden()
  await expect(
    page.getByRole('textbox', { name: '快速新增任務名稱' }),
  ).toBeHidden()
  const backgrounds = new Set<string>()
  for (const name of [
    '苔綠',
    '亞麻',
    '海鹽',
    '薰衣草',
    '玫瑰',
    '沙丘',
    '午夜',
    '石墨',
    '夜森',
    '極光',
    '暮紫',
    '摩卡',
  ]) {
    await page.getByRole('radio', { name, exact: true }).check()
    await expect(page.getByRole('status')).toHaveText(`目前主題：${name}`)
    backgrounds.add(
      await page
        .locator('html')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
  }
  expect(backgrounds.size).toBe(12)
  await page.getByRole('radio', { name: '海鹽', exact: true }).check()
  await expect(page.locator('html')).toHaveCSS(
    'background-color',
    'rgb(243, 248, 252)',
  )
  await expect(page.locator('.sidebar')).toHaveCSS(
    'background-color',
    'rgb(234, 242, 248)',
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: '/private/tmp/famo-themes-light.png',
    fullPage: true,
  })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await expect(
    page.getByRole('radio', { name: '海鹽', exact: true }),
  ).toBeChecked()
  await page.getByRole('radio', { name: '午夜', exact: true }).check()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    '#171e2b',
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: '/private/tmp/famo-themes-dark.png',
    fullPage: true,
  })
  expect(await (await request.get('/api/settings')).json()).toEqual(settings)
  expect(await (await request.get('/api/tasks')).json()).toEqual(tasks)
})

test('深色主題套用到任務、表單、月曆及詳情，切換頁面保留新增草稿', async ({
  page,
  request,
}) => {
  await request.post('/api/tasks', {
    data: { title: '深色主題驗收', description: '夜間的備註' },
  })
  await page.goto('/')
  const capture = page.getByRole('textbox', { name: '快速新增任務名稱' })
  await capture.fill('尚未送出的草稿')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('radio', { name: '午夜', exact: true }).check()
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await expect(capture).toHaveValue('尚未送出的草稿')
  await expect(page.locator('.capture-entry')).toHaveCSS(
    'background-color',
    'rgb(30, 40, 56)',
  )
  await page.getByRole('button', { name: '開啟日期選單' }).click()
  const calendar = page.getByRole('dialog', { name: '選擇日期' })
  await expect(calendar).toHaveCSS('background-color', 'rgb(30, 40, 56)')
  await expect(calendar.getByLabel('選擇日期', { exact: true })).toHaveCSS(
    'color-scheme',
    'dark',
  )
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  const row = page.locator('.task-row').filter({
    has: page.getByRole('textbox', {
      name: '編輯任務標題：深色主題驗收',
      exact: true,
    }),
  })
  await expect(row).toHaveCSS('background-color', 'rgb(23, 30, 43)')
  await row
    .getByRole('button', { name: '任務詳情：深色主題驗收', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveCSS('background-color', 'rgb(30, 40, 56)')
  await expect(dialog).toHaveCSS('color', 'rgb(224, 232, 244)')
  await dialog.getByRole('button', { name: '編輯備註', exact: true }).click()
  await expect(
    dialog.getByRole('textbox', { name: '備註', exact: true }),
  ).toHaveCSS('background-color', 'rgb(30, 40, 56)')
})

test('跟隨系統即時更新，固定主題維持選擇', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('radio', { name: '跟隨系統', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  await expect(page.getByRole('status')).toHaveText('跟隨系統 · 目前為午夜')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await expect(
    page.getByRole('radio', { name: '跟隨系統', exact: true }),
  ).toBeChecked()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
  await page.getByRole('radio', { name: '摩卡', exact: true }).check()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'mocha')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
})

test('分頁同步主題，清除或無效偏好使用預設值', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  const other = await context.newPage()
  await other.goto('/')
  await page.getByRole('radio', { name: '玫瑰', exact: true }).check()
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'rose')
  await other.getByRole('button', { name: '設定', exact: true }).click()
  await expect(
    other.getByRole('radio', { name: '玫瑰', exact: true }),
  ).toBeChecked()
  await other.getByRole('radio', { name: '夜森', exact: true }).check()
  await expect(
    page.getByRole('radio', { name: '夜森', exact: true }),
  ).toBeChecked()
  await other.evaluate(() => localStorage.removeItem('famo.theme'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
  await other.evaluate(() =>
    localStorage.setItem('famo.theme', 'unknown-theme'),
  )
  await other.reload()
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'moss')
})

test('手機可選主題並支援鍵盤操作，頁面無水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  const moss = page.getByRole('radio', { name: '苔綠', exact: true })
  await moss.focus()
  await page.keyboard.press('ArrowRight')
  await expect(
    page.getByRole('radio', { name: '亞麻', exact: true }),
  ).toBeChecked()
  await page.getByRole('radio', { name: '暮紫', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'plum')
  await page.screenshot({
    path: '/private/tmp/famo-themes-mobile.png',
    fullPage: true,
  })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
})

test('本機儲存不可用時仍可切換主題，並顯示未儲存提示', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage unavailable')
    }
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable')
    }
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('radio', { name: '石墨', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'charcoal')
  await expect(page.getByRole('alert')).toContainText(
    '主題已套用，但無法儲存偏好',
  )
  expect(errors).toEqual([])
})
