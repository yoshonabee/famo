import { expect, test } from '@playwright/test'

test('描述直接編輯、Agent 更新與歷程收合', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: '新增任務', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('任務名稱').fill('新版詳細頁驗收')
  await dialog
    .getByLabel('描述', { exact: true })
    .fill('任務目標\n背景與完成條件')
  await dialog.getByLabel('任務類型').selectOption('development')
  await expect(dialog.getByLabel('下一步與子步驟（每行一個）')).toHaveCount(0)
  await dialog.getByRole('button', { name: '建立任務', exact: true }).click()
  await page
    .getByRole('button', { name: '任務詳情：新版詳細頁驗收', exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: '編輯內容', exact: true }),
  ).toHaveCount(0)
  await expect(dialog.locator('details')).not.toHaveAttribute('open')
  await expect(dialog.locator('.history')).not.toBeVisible()
  await dialog
    .getByRole('button', { name: '編輯任務標題', exact: true })
    .click()
  await dialog
    .getByRole('textbox', { name: '任務標題', exact: true })
    .fill('已直接改名')
  await dialog
    .getByRole('textbox', { name: '任務標題', exact: true })
    .press('Enter')
  await expect(
    dialog.getByRole('button', { name: '編輯任務標題', exact: true }),
  ).toHaveText('已直接改名')
  await dialog.getByRole('button', { name: '編輯描述', exact: true }).click()
  const description = dialog.getByRole('textbox', { name: '描述', exact: true })
  await description.fill('修改描述\n保留換行')
  await description.press('Escape')
  await expect(
    dialog.getByRole('button', { name: '編輯描述', exact: true }),
  ).toHaveText('任務目標\n背景與完成條件')
  await dialog.getByRole('button', { name: '編輯描述', exact: true }).click()
  await description.fill('修改描述\n保留換行')
  await description.press('Control+Enter')
  await expect(
    dialog.getByRole('button', { name: '編輯描述', exact: true }),
  ).toHaveText('修改描述\n保留換行')
  await expect(
    dialog.getByRole('heading', { name: '等待與提醒', exact: true }),
  ).toHaveCount(0)
  await expect(dialog.getByLabel('等待原因（選填）')).toHaveCount(0)
  await expect(dialog.getByLabel('下次查看（選填）')).toHaveCount(0)
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(
    page
      .getByRole('list', { name: '主要任務列表', exact: true })
      .getByRole('textbox', { name: '編輯任務標題：已直接改名', exact: true }),
  ).toBeVisible()
  const tasks = await (await request.get('/api/tasks')).json()
  const task = tasks.find((t: { title: string }) => t.title === '已直接改名')
  expect(task.description).toBe('修改描述\n保留換行')
  expect(task.steps).toEqual([])
  expect(
    (
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: {
          op: 'update',
          version: task.version,
          stage: 'PR review',
          source: 'agent:e2e',
          review_at: new Date(Date.now() - 60000).toISOString(),
          links: [
            {
              type: 'GitHub PR',
              url: 'https://github.com/example/repo/pull/1',
            },
          ],
        },
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await request.post(`/api/tasks/${task.id}/actions`, {
        data: {
          op: 'update',
          version: task.version,
          description: '舊版本不可覆寫',
        },
      })
    ).status(),
  ).toBe(409)
  await page.reload()
  const mainList = page.getByRole('list', { name: '主要任務列表', exact: true })
  await expect(mainList.getByRole('link', { name: 'GitHub PR' })).toBeVisible()
  await mainList
    .getByRole('button', { name: '任務詳情：已直接改名', exact: true })
    .click()
  await expect(dialog.locator('.history')).not.toBeVisible()
  await dialog.getByText(/^進展歷程（/).click()
  await expect(dialog.getByText(/agent:e2e/)).toBeVisible()
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await mainList
    .getByRole('button', { name: '任務詳情：已直接改名', exact: true })
    .click()
  await expect(dialog.locator('.history')).not.toBeVisible()
  await dialog.getByRole('button', { name: '編輯描述', exact: true }).click()
  await dialog
    .getByRole('textbox', { name: '描述', exact: true })
    .fill('離開欄位自動儲存')
  await dialog.getByRole('heading', { name: '描述', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '編輯描述', exact: true }),
  ).toHaveText('離開欄位自動儲存')
  await dialog.getByRole('button', { name: '完成任務', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '恢復為未完成', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: '編輯描述', exact: true }).click()
  await dialog
    .getByRole('textbox', { name: '描述', exact: true })
    .fill('已完成後補上的描述')
  await dialog
    .getByRole('textbox', { name: '描述', exact: true })
    .press('Control+Enter')
  await expect(
    dialog.getByRole('button', { name: '編輯描述', exact: true }),
  ).toHaveText('已完成後補上的描述')
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await page.getByRole('button', { name: '已完成', exact: false }).click()
  await expect(
    page.getByRole('checkbox', { name: '恢復任務：已直接改名', exact: true }),
  ).toBeChecked()
  expect(errors).toEqual([])
})

test('手機描述草稿保留版本衝突，空白標題與中文選字不誤存', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const task = await (
    await request.post('/api/tasks', {
      data: { title: '手機直接編輯', description: '初始描述' },
    })
  ).json()
  await page.goto('/')
  await page
    .getByRole('button', { name: '任務詳情：手機直接編輯', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '編輯描述', exact: true }).click()
  const description = dialog.getByRole('textbox', { name: '描述', exact: true })
  await description.fill('保留的本機草稿')
  await request.post(`/api/tasks/${task.id}/actions`, {
    data: { op: 'update', version: task.version, description: 'Agent 新描述' },
  })
  await description.press('Control+Enter')
  await expect(dialog.getByRole('alert')).toContainText('任務已被更新')
  await expect(description).toHaveValue('保留的本機草稿')
  await dialog.getByRole('button', { name: '取消並讀取最新內容' }).click()
  await expect(
    dialog.getByRole('button', { name: '編輯描述', exact: true }),
  ).toHaveText('Agent 新描述')
  await dialog
    .getByRole('button', { name: '編輯任務標題', exact: true })
    .click()
  const title = dialog.getByRole('textbox', { name: '任務標題', exact: true })
  await title.fill('')
  await title.press('Enter')
  await expect(dialog.getByRole('alert')).toContainText('標題不可空白')
  await title.fill('選字中的標題')
  await title.dispatchEvent('compositionstart')
  await title.press('Enter')
  await expect(title).toBeVisible()
  await title.dispatchEvent('compositionend')
  await title.press('Escape')
  await expect(
    dialog.getByRole('button', { name: '編輯任務標題', exact: true }),
  ).toHaveText('手機直接編輯')
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
