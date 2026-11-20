import { expect, test } from '@playwright/test'
import { setTaskDate } from './date-picker'

test('Project 新增、改名、指派和日期檢視', async ({ page }) => {
  await page.goto('/')
  const today = await page.locator('h1 time').getAttribute('datetime')
  expect(today).not.toBeNull()

  const nav = page.getByRole('region', { name: 'Project 導覽' })
  for (const name of ['網站改版', '生活雜事']) {
    await nav.getByRole('button', { name: '新增 Project' }).click()
    const editor = page.getByRole('dialog', { name: '新增 Project' })
    await editor.getByRole('textbox', { name: 'Project 名稱' }).fill(name)
    await editor.getByRole('button', { name: '儲存' }).click()
    await expect(editor).toBeHidden()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }

  const input = page.getByRole('textbox', { name: '快速新增任務名稱' })
  await input.fill('整理家裡文件')
  await input.press('Enter')
  const open = (title: string) =>
    page.getByRole('button', { name: `任務詳情：${title}` })
  await open('整理家裡文件').click()
  const details = page.getByRole('dialog', { name: '整理家裡文件' })
  const project = details.getByRole('combobox', { name: 'Project' })
  await expect(project.locator('option:checked')).toHaveText('生活雜事')
  await setTaskDate(details, today!)
  await expect(
    details.getByRole('button', { name: `任務日期：${today}` }),
  ).toBeVisible()
  await details.getByRole('button', { name: '關閉', exact: true }).click()

  await nav.getByRole('button', { name: '網站改版', exact: true }).click()
  await expect(open('整理家裡文件')).toHaveCount(0)
  await page.keyboard.press('Meta+t')
  const palette = page.getByRole('dialog', { name: '快速新增任務' })
  await expect(palette.getByText('網站改版', { exact: true })).toBeVisible()
  const floating = palette.getByRole('textbox', { name: '快速新增任務名稱' })
  await floating.fill('整理網站頁面')
  await floating.press('Enter')
  await expect(palette.getByRole('status')).toHaveText('已新增：整理網站頁面')
  await page.keyboard.press('Escape')
  await expect(open('整理網站頁面')).toBeVisible()

  await page.getByRole('button', { name: '今日任務' }).click()
  const daily = page.getByRole('list', { name: '當日未完成任務' })
  await expect(daily.getByText('生活雜事', { exact: true })).toBeVisible()
  await expect(daily.getByText('網站改版', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '任務列表' }).click()
  const all = page.getByRole('list', { name: '主要任務列表' })
  await expect(
    all.getByRole('textbox', { name: '編輯任務標題：整理家裡文件' }),
  ).toBeVisible()
  await expect(
    all.getByRole('textbox', { name: '編輯任務標題：整理網站頁面' }),
  ).toBeVisible()

  await open('整理家裡文件').click()
  await project.selectOption({ label: '網站改版' })
  await expect(project.locator('option:checked')).toHaveText('網站改版')
  await details.getByRole('button', { name: '關閉', exact: true }).click()
  await nav.getByRole('button', { name: '網站改版', exact: true }).click()
  await expect(open('整理家裡文件')).toBeVisible()
  await page.getByRole('checkbox', { name: '完成任務：整理家裡文件' }).click()
  await expect(
    page
      .getByRole('list', { name: 'Project 已完成任務' })
      .getByRole('textbox', { name: '編輯任務標題：整理家裡文件' }),
  ).toBeVisible()

  await page.getByRole('button', { name: '重新命名 Project' }).click()
  const rename = page.getByRole('dialog', { name: '重新命名 Project' })
  await rename.getByRole('textbox').fill('網站維護')
  await rename.getByRole('button', { name: '儲存' }).click()
  await expect(rename).toBeHidden()
  await expect(page.getByRole('heading', { name: '網站維護' })).toBeVisible()

  await page.reload()
  await nav.getByRole('button', { name: '網站維護', exact: true }).click()
  await expect(open('整理家裡文件')).toBeVisible()
  await open('整理家裡文件').click()
  await project.selectOption({ label: '未分類' })
  await expect(project).toHaveValue('')
  await details.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(open('整理家裡文件')).toHaveCount(0)
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(open('整理家裡文件')).toBeVisible()
})
