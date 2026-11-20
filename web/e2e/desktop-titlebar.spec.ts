import { expect, test } from '@playwright/test'

test('桌面標題列隨側欄和主題調整，保留上方控制項的操作空間', async ({
  page,
}) => {
  await page.goto('/')
  const titlebar = page.locator('.window-titlebar')
  const sidebar = page.locator('.sidebar')
  const main = page.locator('.app-shell > main')
  const themeColours = () =>
    titlebar.evaluate((element) => ({
      sidebar: getComputedStyle(element, '::before').backgroundColor,
      canvas: getComputedStyle(element).backgroundColor,
    }))
  const sidebarWidth = () =>
    titlebar.evaluate((element) => getComputedStyle(element, '::before').width)

  await expect(titlebar).toHaveCSS('height', '0px')
  await page.addStyleTag({
    content: ':root { --window-titlebar-height: 30px; }',
  })
  await expect(titlebar).toHaveCSS('height', '30px')
  await expect(sidebar).toHaveCSS('padding-top', '50px')
  await expect(main).toHaveCSS('padding-top', '30px')
  expect(await sidebarWidth()).toBe('168px')

  await page.getByRole('button', { name: '收合側邊欄' }).click()
  expect(await sidebarWidth()).toBe('56px')
  const light = await themeColours()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('radio', { name: '午夜', exact: true }).check()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  const dark = await themeColours()
  expect(dark.sidebar).not.toBe(light.sidebar)
  expect(dark.canvas).not.toBe(light.canvas)
  await expect(sidebar).toHaveCSS('background-color', dark.sidebar)
  await expect(page.locator('html')).toHaveCSS('background-color', dark.canvas)

  await page.setViewportSize({ width: 620, height: 500 })
  await expect(main).toHaveCSS('padding-top', '0px')
  await expect(sidebar).toHaveCSS('padding-top', '42px')
  await expect(titlebar).toHaveCSS('background-color', dark.sidebar)
})
