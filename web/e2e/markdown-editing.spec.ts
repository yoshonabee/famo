import { expect, test } from '@playwright/test'

test('直接編輯標題、Enter 儲存、Escape 取消，空白後再 Backspace 刪除', async ({
  page,
  request,
}) => {
  const task = await (
    await request.post('/api/tasks', {
      data: {
        title: 'Markdown 直接改字',
        type: 'general',
        priority: 1,
        context: '保留的背景',
      },
    })
  ).json()
  await page.goto('/')
  const capture = page.getByRole('textbox', { name: '快速新增任務名稱' })
  const border = await capture
    .locator('..')
    .evaluate((el) => getComputedStyle(el).borderColor)
  await capture.click()
  expect(
    await capture.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe('none')
  expect(
    await capture
      .locator('..')
      .evaluate((el) => getComputedStyle(el).borderColor),
  ).toBe(border)
  const row = page.locator(`[data-task-id="${task.id}"]`)
  const title = row.locator('input.todo-title')
  await title.click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await title.fill('Markdown 已改名')
  await title.press('Enter')
  await expect(title).toHaveAttribute(
    'aria-label',
    '編輯任務標題：Markdown 已改名',
  )
  await page.reload()
  await expect(title).toHaveValue('Markdown 已改名')
  await title.click()
  await title.fill('不應儲存的草稿')
  await title.press('Escape')
  await expect(title).toHaveValue('Markdown 已改名')
  await title.click()
  await title.fill('')
  await capture.click()
  await expect(title).toHaveValue('Markdown 已改名')
  await row.getByRole('button', { name: '任務詳情：Markdown 已改名' }).click()
  await expect(
    page.getByRole('dialog').getByText('保留的背景', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '關閉', exact: true }).click()
  await title.click()
  await title.fill('X')
  await title.press('Backspace')
  await expect(title).toHaveValue('')
  await expect(row).toBeVisible()
  await title.dispatchEvent('compositionstart')
  await title.press('Backspace')
  await title.dispatchEvent('compositionend')
  await title.dispatchEvent('keydown', { key: 'Backspace', repeat: true })
  await expect(row).toBeVisible()
  await title.press('Backspace')
  await expect(row).not.toBeVisible()
  expect((await request.get(`/api/tasks/${task.id}`)).status()).toBe(404)
  await page.reload()
  await expect(row).not.toBeVisible()
})

test('子步驟的改字與刪除只影響子步驟；完成狀態可從列表及詳情恢復', async ({
  page,
  request,
}) => {
  const parent = await (
    await request.post('/api/tasks', {
      data: {
        title: 'Markdown parent',
        steps: ['第一個小步驟', '第二個小步驟'],
        context: 'parent context',
      },
    })
  ).json()
  await page.goto('/')
  const row = page.locator(`[data-task-id="${parent.id}"]`)
  const title = row.locator('input.todo-title')
  await title.click()
  await title.fill('改過的小步驟')
  await title.press('Enter')
  await expect(title).toHaveAttribute(
    'aria-label',
    '編輯步驟標題：改過的小步驟',
  )
  let saved = await (await request.get(`/api/tasks/${parent.id}`)).json()
  expect(saved.title).toBe('Markdown parent')
  expect(saved.context).toBe('parent context')
  await title.click()
  await title.fill('')
  await title.press('Backspace')
  await expect(title).toHaveValue('第二個小步驟')
  saved = await (await request.get(`/api/tasks/${parent.id}`)).json()
  expect(saved.steps).toHaveLength(1)
  await row.getByRole('checkbox', { name: '完成步驟：第二個小步驟' }).click()
  await row.getByRole('checkbox', { name: '恢復步驟：第二個小步驟' }).click()
  await expect(
    row.getByRole('checkbox', { name: '完成步驟：第二個小步驟' }),
  ).not.toBeChecked()
  await row.getByRole('button', { name: '任務詳情：Markdown parent' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '完成整件任務' }).click()
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await page.getByRole('button', { name: '已完成', exact: false }).click()
  await row.getByRole('checkbox', { name: '恢復任務：Markdown parent' }).click()
  await expect(row).not.toBeVisible()
  await page.getByRole('button', { name: '我的工作台', exact: false }).click()
  await expect(title).toHaveValue('第二個小步驟')
  await row.getByRole('button', { name: '任務詳情：Markdown parent' }).click()
  await dialog.getByRole('button', { name: '完成整件任務' }).click()
  await dialog
    .getByRole('button', { name: '恢復為未完成', exact: true })
    .click()
  await expect(
    dialog.getByText('parent context', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: '完成整件任務' }),
  ).toBeVisible()
})

test('列內草稿遇到版本衝突保留文字，不覆寫新資料', async ({
  page,
  request,
}) => {
  const task = await (
    await request.post('/api/tasks', { data: { title: 'Markdown 衝突測試' } })
  ).json()
  await page.goto('/')
  const row = page.locator(`[data-task-id="${task.id}"]`)
  const title = row.locator('input.todo-title')
  await title.click()
  await title.fill('本機未儲存草稿')
  expect(
    (
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: {
          op: 'update',
          version: task.version,
          title: '外部已更新標題',
          context: '外部已更新背景',
          source: 'agent:test',
        },
      })
    ).status(),
  ).toBe(200)
  await title.press('Enter')
  await expect(row.getByRole('alert')).toContainText('任務已被更新')
  await expect(title).toHaveValue('本機未儲存草稿')
  await row.getByRole('button', { name: '取消並讀取最新標題' }).click()
  await expect(title).toHaveValue('外部已更新標題')
  const saved = await (await request.get(`/api/tasks/${task.id}`)).json()
  expect(saved.context).toBe('外部已更新背景')
  expect(saved.version).toBe(2)
})
