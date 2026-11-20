import { expect, test } from '@playwright/test'

test('手機可用鍵盤切換設定分類並保留兩處未儲存的草稿', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await page.getByRole('button', { name: '設定', exact: true }).click()

  const navigation = page.getByRole('navigation', { name: '設定分類' })
  const appearance = navigation.getByRole('button', { name: '外觀' })
  const agent = navigation.getByRole('button', { name: '本機 Agent' })
  await expect(appearance).toHaveAttribute('aria-current', 'true')
  await page.getByRole('button', { name: '新增主題', exact: true }).click()
  const themeName = page.getByLabel('主題名稱', { exact: true })
  await themeName.fill('未儲存的主題')

  await agent.focus()
  await page.keyboard.press('Enter')
  await expect(agent).toBeFocused()
  await expect(agent).toHaveAttribute('aria-current', 'true')
  await expect(appearance).not.toHaveAttribute('aria-current', 'true')
  await expect(
    page.getByRole('region', { name: '外觀', exact: true }),
  ).toBeHidden()
  const workspacePath = page.getByLabel('工作區路徑', { exact: true })
  await workspacePath.fill('/tmp/unsaved-workspace')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )

  await appearance.click()
  await expect(themeName).toHaveValue('未儲存的主題')
  await agent.click()
  await expect(workspacePath).toHaveValue('/tmp/unsaved-workspace')
})
