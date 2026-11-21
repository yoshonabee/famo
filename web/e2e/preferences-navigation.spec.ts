import { expect, test } from '@playwright/test'

test('手機可用鍵盤切換設定分類並保留兩處未儲存的草稿', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await page.getByRole('button', { name: '設定', exact: true }).click()

  const navigation = page.getByRole('navigation', { name: '設定分類' })
  const appearance = navigation.getByRole('button', { name: '外觀' })
  const general = navigation.getByRole('button', { name: '一般', exact: true })
  const agent = navigation.getByRole('button', { name: 'Agents' })
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

  await general.click()
  const generalSettings = page.getByRole('region', {
    name: '一般',
    exact: true,
  })
  for (const name of ['語言', '側邊欄', '本機資料']) {
    await expect(generalSettings.getByRole('region', { name })).toBeVisible()
  }
  await appearance.click()
  await expect(themeName).toHaveValue('未儲存的主題')
  await agent.click()
  await expect(workspacePath).toHaveValue('/tmp/unsaved-workspace')
})

test('可分別將任務及已完成移到側欄底部，重新開啟後沿用', async ({ page }) => {
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: '主要導覽' })
  const footer = page.locator('.sidebar > .sidebar-footer')
  const tasks = page.getByRole('button', { name: '任務列表', exact: true })
  const completed = page.getByRole('button', { name: '已完成', exact: true })
  const settings = page.getByRole('button', { name: '設定', exact: true })
  const general = page.getByRole('button', { name: '一般', exact: true })
  const moveTasks = page.getByRole('checkbox', {
    name: '將「任務」移到「最近刪除」上方',
  })
  const moveCompleted = page.getByRole('checkbox', {
    name: '將「已完成」移到「最近刪除」上方',
  })
  const rows = navigation.getByRole('listitem')
  await expect(
    rows.nth(0).getByRole('button', { name: '今日任務' }),
  ).toBeVisible()
  await expect(
    rows.nth(1).getByRole('button', { name: '任務列表' }),
  ).toBeVisible()
  await expect(
    navigation.getByRole('button', { name: '已完成', exact: true }),
  ).toBeVisible()
  await expect(footer.getByRole('button')).toHaveText(['最近刪除', '設定'])

  await settings.click()
  await general.click()
  await expect(moveCompleted).not.toBeChecked()
  await expect(moveTasks).not.toBeChecked()
  await moveCompleted.check()
  await expect(footer.getByRole('button')).toHaveText([
    /^已完成/,
    '最近刪除',
    '設定',
  ])
  await moveTasks.check()
  await expect(footer.getByRole('button')).toHaveText([
    /^任務/,
    /^已完成/,
    '最近刪除',
    '設定',
  ])
  await page.reload()

  await tasks.click()
  await expect(tasks).toHaveAttribute('aria-current', 'page')
  await completed.click()
  await expect(completed).toHaveAttribute('aria-current', 'page')
  await settings.click()
  await general.click()
  await expect(moveTasks).toBeChecked()
  await expect(moveCompleted).toBeChecked()
  await moveTasks.uncheck()
  await expect(
    navigation.getByRole('button', { name: '任務列表' }),
  ).toBeVisible()
  await expect(
    footer.getByRole('button', { name: '已完成', exact: true }),
  ).toBeVisible()
})
