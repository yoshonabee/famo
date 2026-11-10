import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const sampleTheme = {
  name: '薄荷巧克力',
  description: '自己的夜間配色',
  mode: 'dark',
  colors: {
    canvas: '#182822',
    background: '#20342a',
    sidebar: '#132019',
    foreground: '#e4f3eb',
    primary: '#8ee0ba',
    'primary-foreground': '#123024',
    'muted-foreground': '#abc6b8',
    border: '#436454',
    accent: '#2c4c3b',
  },
}
const themeFile = (themes = [sampleTheme]) => ({
  format: 'famo-theme',
  version: 1,
  themes,
})
async function openSettings(page: Page) {
  await page.getByRole('button', { name: '設定', exact: true }).click()
}
async function importJSON(page: Page, value: unknown) {
  await page.getByLabel('匯入主題檔案').setInputFiles({
    name: 'themes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  })
}
async function exportedJSON(page: Page, button: string) {
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: button, exact: true }).click()
  const download = await downloading
  const path = await download.path()
  expect(download.suggestedFilename()).toMatch(/\.json$/)
  return JSON.parse(await readFile(path!, 'utf8'))
}

test('設定位於側欄底部，桌面選單事件會開啟設定且保留新增草稿', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const settings = page.getByRole('button', { name: '設定', exact: true })
  const box = await settings.boundingBox()
  expect(box!.y).toBeGreaterThan(720)
  await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(3)
  const capture = page.getByRole('textbox', { name: '快速新增任務名稱' })
  await capture.fill('選單切換前的草稿')
  await page.evaluate(() =>
    window.dispatchEvent(new Event('famo:open-settings')),
  )
  await expect(
    page.getByRole('heading', { name: '設定', exact: true }),
  ).toBeVisible()
  await expect(settings).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await expect(capture).toHaveValue('選單切換前的草稿')
  await request.post('/api/tasks', { data: { title: '選單跳轉驗收' } })
  await page.reload()
  await page.getByRole('button', { name: '任務列表', exact: true }).click()
  await page
    .getByRole('button', { name: '任務詳情：選單跳轉驗收', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(new Event('famo:open-settings')),
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: '設定', exact: true }),
  ).toBeVisible()
})

test('調色盤預覽、新增、重開、編輯及刪除自訂主題', async ({ page }) => {
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('button', { name: '新增主題', exact: true }).click()
  const editor = page.locator('.theme-editor')
  await editor.getByLabel('主題名稱', { exact: true }).fill('我的薄荷')
  await editor.getByLabel('基礎主題', { exact: true }).selectOption('midnight')
  await editor.getByLabel('頁面背景色碼').fill('#182822')
  await editor.getByLabel('強調色調色盤', { exact: true }).fill('#8ee0ba')
  await expect(editor.locator('.palette-preview')).toHaveCSS(
    'background-color',
    'rgb(24, 40, 34)',
  )
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await openSettings(page)
  await expect(editor.getByLabel('主題名稱', { exact: true })).toHaveValue(
    '我的薄荷',
  )
  await editor.getByLabel('頁面背景色碼').fill('#xyz')
  await editor.getByRole('button', { name: '儲存主題', exact: true }).click()
  await expect(editor).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(13)
  await editor.getByLabel('頁面背景色碼').fill('#182822')
  await editor.screenshot({ path: '/private/tmp/famo-theme-palette.png' })
  await editor.getByRole('button', { name: '儲存主題', exact: true }).click()
  await expect(
    page.getByRole('radio', { name: '我的薄荷', exact: true }),
  ).toBeChecked()
  await expect(page.locator('html')).toHaveCSS(
    'background-color',
    'rgb(24, 40, 34)',
  )
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  const id = await page.locator('html').getAttribute('data-theme')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', id!)
  await openSettings(page)
  await page
    .getByRole('button', { name: '編輯主題：我的薄荷', exact: true })
    .click()
  await editor.getByLabel('主題名稱', { exact: true }).fill('薄荷夜色')
  await editor.getByLabel('側欄背景色碼').fill('#112233')
  await editor.getByRole('button', { name: '儲存變更', exact: true }).click()
  await expect(
    page.getByRole('radio', { name: '薄荷夜色', exact: true }),
  ).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', id!)
  await expect(page.locator('.sidebar')).toHaveCSS(
    'background-color',
    'rgb(17, 34, 51)',
  )
  await page
    .getByRole('button', { name: '刪除主題：薄荷夜色', exact: true })
    .click()
  await page
    .locator('.custom-theme-actions')
    .getByRole('button', { name: '取消', exact: true })
    .click()
  await expect(
    page.getByRole('radio', { name: '薄荷夜色', exact: true }),
  ).toBeChecked()
  await page
    .getByRole('button', { name: '刪除主題：薄荷夜色', exact: true })
    .click()
  await page.getByRole('button', { name: '確認刪除', exact: true }).click()
  await expect(page.getByRole('radio')).toHaveCount(13)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
})

test('內建與自訂主題可匯出、匯入，重名保留兩份，整包可移至另一個瀏覽器', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('radio', { name: '玫瑰', exact: true }).check()
  const exported = await exportedJSON(page, '匯出目前主題')
  expect(exported.format).toBe('famo-theme')
  expect(exported.version).toBe(1)
  expect(exported.themes).toHaveLength(1)
  expect(exported.themes[0].name).toBe('玫瑰')
  expect(Object.keys(exported.themes[0].colors)).toHaveLength(9)
  await importJSON(page, exported)
  await expect(
    page.getByRole('radio', { name: '玫瑰 (2)', exact: true }),
  ).toBeChecked()
  await importJSON(page, exported)
  await expect(
    page.getByRole('radio', { name: '玫瑰 (3)', exact: true }),
  ).toBeChecked()
  const bundle = await exportedJSON(page, '匯出全部自訂主題')
  expect(bundle.themes).toHaveLength(2)
  expect(bundle.themes[0].colors).toEqual(exported.themes[0].colors)
  const freshContext = await browser.newContext()
  try {
    const fresh = await freshContext.newPage()
    await fresh.goto(page.url())
    await openSettings(fresh)
    await importJSON(fresh, bundle)
    await expect(fresh.getByRole('radio')).toHaveCount(15)
    await expect(
      fresh.getByRole('radio', { name: '玫瑰 (2)', exact: true }),
    ).toBeChecked()
    await fresh.reload()
    await openSettings(fresh)
    await expect(
      fresh.getByRole('radio', { name: '玫瑰 (3)', exact: true }),
    ).toBeVisible()
  } finally {
    await freshContext.close()
  }
})

test('匯入完整驗證檔案，格式、版本、配色與大小錯誤都不留下部分主題', async ({
  page,
}) => {
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('radio', { name: '海鹽', exact: true }).check()
  const before = await page.evaluate(() => localStorage.getItem('famo.theme'))
  for (const value of [
    { ...themeFile(), version: 2 },
    { ...themeFile(), themes: [] },
    themeFile([
      sampleTheme,
      { ...sampleTheme, colors: { ...sampleTheme.colors, canvas: 'url(x)' } },
    ]),
    themeFile([{ ...sampleTheme, name: '   ' }]),
    {
      ...themeFile(),
      themes: [{ ...sampleTheme, colors: { canvas: '#123456' } }],
    },
  ]) {
    await importJSON(page, value)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(13)
    expect(await page.evaluate(() => localStorage.getItem('famo.theme'))).toBe(
      before,
    )
  }
  await page.getByLabel('匯入主題檔案').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{oops'),
  })
  await expect(page.getByRole('alert')).toContainText('有效的 JSON')
  await page.getByLabel('匯入主題檔案').setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc((1 << 20) + 1),
  })
  await expect(page.getByRole('alert')).toContainText('不可超過 1 MB')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean')
  await expect(page.getByRole('radio')).toHaveCount(13)
})

test('自訂主題新增、編輯與刪除會同步到其他分頁', async ({ page, context }) => {
  await page.goto('/')
  await openSettings(page)
  const other = await context.newPage()
  await other.goto('/')
  await openSettings(other)
  await importJSON(page, themeFile())
  await expect(
    other.getByRole('radio', { name: sampleTheme.name, exact: true }),
  ).toBeChecked()
  await other
    .getByRole('button', { name: `編輯主題：${sampleTheme.name}`, exact: true })
    .click()
  await other.getByLabel('主題名稱', { exact: true }).fill('另一個分頁改名')
  await other.getByRole('button', { name: '儲存變更', exact: true }).click()
  await expect(
    page.getByRole('radio', { name: '另一個分頁改名', exact: true }),
  ).toBeChecked()
  await other
    .getByRole('button', { name: '刪除主題：另一個分頁改名', exact: true })
    .click()
  await other.getByRole('button', { name: '確認刪除', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
  await expect(page.getByRole('radio')).toHaveCount(13)
})

test('儲存空間不足保留調色草稿，匯入失敗不改變原主題', async ({ page }) => {
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('radio', { name: '海鹽', exact: true }).check()
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Full', 'QuotaExceededError')
    }
  })
  await page.getByRole('button', { name: '新增主題', exact: true }).click()
  const editor = page.locator('.theme-editor')
  await editor.getByLabel('主題名稱', { exact: true }).fill('不能弄丟的草稿')
  await editor.getByLabel('強調色色碼', { exact: true }).fill('#112233')
  await editor.getByRole('button', { name: '儲存主題', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('主題尚未儲存')
  await expect(editor.getByLabel('主題名稱', { exact: true })).toHaveValue(
    '不能弄丟的草稿',
  )
  await expect(editor.getByLabel('強調色色碼', { exact: true })).toHaveValue(
    '#112233',
  )
  await expect(page.getByRole('radio')).toHaveCount(13)
  await importJSON(page, themeFile())
  await expect(page.locator('.theme-notice[role=alert]')).toContainText(
    '無法儲存主題',
  )
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean')
  await expect(page.getByRole('radio')).toHaveCount(13)
})

test('手機調色盤可操作，取消不套用配色且畫面不溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('button', { name: '新增主題', exact: true }).click()
  const editor = page.locator('.theme-editor')
  await editor.getByLabel('主題名稱', { exact: true }).fill('手機自訂')
  await editor.getByLabel('基礎主題', { exact: true }).selectOption('plum')
  await editor.getByLabel('外觀模式', { exact: true }).selectOption('dark')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await editor.screenshot({
    path: '/private/tmp/famo-theme-palette-mobile.png',
  })
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')
})
