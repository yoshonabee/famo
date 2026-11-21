import { expect, test } from '@playwright/test'

test('清理資料會說明永久刪除，確認後才送出並顯示結果', async ({ page }) => {
  let calls = 0
  await page.route('**/api/tasks/recently-deleted/cleanup', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ confirm: true })
    calls++
    if (calls === 1) {
      await route.fulfill({ status: 500, json: { error: '暫時無法清理' } })
    } else {
      await route.fulfill({ json: { deleted_count: 2 } })
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page
    .getByRole('navigation', { name: '設定分類' })
    .getByRole('button', { name: '一般', exact: true })
    .click()
  const section = page.getByRole('region', { name: '本機資料' })
  const open = section.getByRole('button', { name: '清理資料' })
  await expect(open).toHaveAccessibleDescription(/刪除滿 7 天.*永久移除/)
  await open.click()
  const dialog = page.getByRole('dialog', { name: '清理資料' })
  const cancel = dialog.getByRole('button', { name: '取消' })
  await expect(cancel).toBeFocused()
  await expect(dialog).toHaveAccessibleDescription(/無法在 Famo 還原/)
  await cancel.click()
  await expect(dialog).toBeHidden()
  expect(calls).toBe(0)

  await open.click()
  const confirm = dialog.getByRole('button', { name: '永久清理' })
  await confirm.click()
  await expect(dialog.getByRole('alert')).toHaveText('暫時無法清理')
  await confirm.click()
  await expect(dialog).toBeHidden()
  await expect(section.getByRole('status')).toHaveText(
    '已永久清理 2 筆已刪除任務。',
  )
  expect(calls).toBe(2)
})
