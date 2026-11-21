import { expect, test } from '@playwright/test'

test('Board 圖示可設定、重新編輯及還原為預設', async ({ page, context }) => {
  const name = '圖示測試 Board'
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '主要導覽' })
  await nav.getByRole('button', { name: '新增 Board' }).click()
  let editor = page.getByRole('dialog', { name: '新增 Board' })
  const defaultIcon = () => editor.getByRole('radio', { name: '格狀（預設）' })
  await expect(defaultIcon()).toBeChecked()
  await editor.getByRole('textbox', { name: 'Board 名稱' }).fill(name)
  await editor.getByRole('radio', { name: '公事包' }).check()
  await editor.getByRole('button', { name: '儲存' }).click()

  const board = nav.getByRole('button', { name, exact: true })
  await expect(board.locator('svg.lucide-briefcase')).toBeVisible()
  await page.reload()
  await expect(board.locator('svg.lucide-briefcase')).toBeVisible()

  const panel = await context.newPage()
  await panel.setViewportSize({ width: 360, height: 480 })
  await panel.goto('/menu-bar.html')
  await panel.getByRole('button', { name: /^選擇 Board：/ }).click()
  const choice = panel.getByRole('menuitemradio', { name, exact: true })
  await expect(choice.locator('svg.lucide-briefcase')).toBeVisible()
  await choice.click()
  await expect(
    panel
      .getByRole('button', { name: `選擇 Board：${name}` })
      .locator('svg.lucide-briefcase'),
  ).toBeVisible()
  await panel.close()

  await board.hover()
  await nav.getByRole('button', { name: `編輯 Board：${name}` }).click()
  editor = page.getByRole('dialog', { name: '編輯 Board' })
  await expect(editor.getByRole('radio', { name: '公事包' })).toBeChecked()
  await defaultIcon().check()
  await editor.getByRole('button', { name: '儲存' }).click()
  await expect(board.locator('svg.lucide-layout-grid')).toBeVisible()
})
