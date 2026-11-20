import { expect, test, type Page } from '@playwright/test'

function boardNavigation(page: Page) {
  return page.getByRole('navigation', { name: '主要導覽' })
}

test('Board 保存各自的今日 Project 篩選並支援重新編輯', async ({
  page,
  request,
}) => {
  const date = '2041-02-15'
  await page.clock.setFixedTime(new Date(`${date}T12:00:00`))

  const work = 'Board 測試工作'
  const errands = 'Board 測試採買'
  const music = 'Board 測試音樂'
  const projects = new Map<string, string>()
  for (const name of [work, errands, music]) {
    const response = await request.post('/api/projects', { data: { name } })
    await expect(response).toBeOK()
    projects.set(name, (await response.json()).id)
  }

  const task = (title: string) =>
    page.getByRole('textbox', { name: `編輯任務標題：${title}`, exact: true })
  for (const [title, project, scheduledDate] of [
    ['Board 審閱報告', work, date],
    ['Board 寄出簡報', work, date],
    ['Board 採買清單', errands, date],
    ['Board 練習樂器', music, date],
    ['Board 未分類任務', '', date],
    ['Board 下次要買', errands, '2041-02-16'],
    ['Board 先前工作', work, '2041-02-14'],
    ['Board 先前採買', errands, '2041-02-14'],
  ]) {
    const response = await request.post('/api/tasks', {
      data: {
        title,
        project_id: projects.get(project),
        scheduled_date: scheduledDate,
      },
    })
    await expect(response).toBeOK()
    if (title === 'Board 寄出簡報') {
      const { id, version } = await response.json()
      const completed = await request.post(`/api/tasks/${id}/actions`, {
        data: { op: 'complete_task', version },
      })
      await expect(completed).toBeOK()
    }
  }

  await page.goto('/')
  const nav = boardNavigation(page)
  const boardButton = (name: string) =>
    nav.getByRole('button', { name, exact: true })
  async function createBoard(name: string, selected: string[]) {
    await nav.getByRole('button', { name: '新增 Board' }).click()
    const editor = page.getByRole('dialog', { name: '新增 Board' })
    await editor.getByRole('textbox', { name: 'Board 名稱' }).fill(name)
    for (const project of selected)
      await editor.getByRole('checkbox', { name: project, exact: true }).check()
    await editor.getByRole('button', { name: '儲存' }).click()
    await expect(editor).toBeHidden()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }

  await createBoard('工作清單 Board', [work])
  await expect(task('Board 審閱報告')).toBeVisible()
  await expect(
    page.getByRole('list', { name: '當日已完成任務' }).getByRole('textbox', {
      name: '編輯任務標題：Board 寄出簡報',
    }),
  ).toBeVisible()
  await expect(task('Board 採買清單')).toHaveCount(0)
  await expect(task('Board 未分類任務')).toHaveCount(0)
  await page.locator('summary').filter({ hasText: '先前未完成' }).click()
  await expect(task('Board 先前工作')).toBeVisible()
  await expect(task('Board 先前採買')).toHaveCount(0)
  const capture = page.getByRole('textbox', { name: '快速新增任務名稱' })
  await capture.fill('Board 新增工作')
  await capture.press('Enter')
  await expect(task('Board 新增工作')).toBeVisible()

  await createBoard('生活清單 Board', [errands, music])
  await expect(task('Board 採買清單')).toBeVisible()
  await expect(task('Board 練習樂器')).toBeVisible()
  await expect(task('Board 下次要買')).toHaveCount(0)
  await page.getByRole('button', { name: '後一天' }).click()
  await expect(
    page.getByRole('heading', { name: '生活清單 Board' }),
  ).toBeVisible()
  await expect(page.locator('.board-date time')).toHaveAttribute(
    'datetime',
    '2041-02-16',
  )
  await expect(task('Board 下次要買')).toBeVisible()
  await expect(task('Board 審閱報告')).toHaveCount(0)
  await page.getByRole('button', { name: '前一天' }).click()
  await expect(task('Board 採買清單')).toBeVisible()
  await expect(task('Board 審閱報告')).toHaveCount(0)
  await expect(task('Board 新增工作')).toHaveCount(0)
  await expect(task('Board 寄出簡報')).toHaveCount(0)
  await boardButton('工作清單 Board').click()
  await expect(task('Board 審閱報告')).toBeVisible()

  const editWork = nav.getByRole('button', {
    name: '編輯 Board：工作清單 Board',
  })
  await page.getByRole('main').hover()
  await expect(editWork).toHaveCSS('opacity', '0')
  await boardButton('工作清單 Board').hover()
  await expect(editWork).toHaveCSS('opacity', '1')
  await page.getByRole('main').hover()
  await expect(editWork).toHaveCSS('opacity', '0')
  await boardButton('工作清單 Board').focus()
  await page.keyboard.press('Tab')
  await expect(editWork).toBeFocused()
  await expect(editWork).toHaveCSS('opacity', '1')
  await boardButton('工作清單 Board').hover()
  await editWork.click()
  const editor = page.getByRole('dialog', { name: '編輯 Board' })
  const choice = (name: string) =>
    editor.getByRole('checkbox', { name, exact: true })
  await expect(choice(work)).toBeChecked()
  await expect(choice(errands)).not.toBeChecked()
  await choice(work).uncheck()
  await choice(errands).check()
  await editor
    .getByRole('textbox', { name: 'Board 名稱' })
    .fill('採買清單 Board')
  await editor.getByRole('button', { name: '儲存' }).click()
  await expect(editor).toBeHidden()
  await expect(task('Board 採買清單')).toBeVisible()
  await expect(task('Board 審閱報告')).toHaveCount(0)

  await page.reload()
  await boardButton('採買清單 Board').click()
  await expect(task('Board 採買清單')).toBeVisible()
  await expect(task('Board 練習樂器')).toHaveCount(0)
  await boardButton('生活清單 Board').click()
  await expect(task('Board 練習樂器')).toBeVisible()
  await createBoard('空白 Board', [])
  await expect(task('Board 採買清單')).toHaveCount(0)
  await expect(task('Board 未分類任務')).toHaveCount(0)
  await expect(page.getByText('已完成 0 / 0')).toBeVisible()

  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await expect(task('Board 審閱報告')).toBeVisible()
  await expect(task('Board 未分類任務')).toBeVisible()
})

test('編輯 Board 發生版本衝突時保留較新的設定', async ({ page, request }) => {
  const response = await request.post('/api/boards', {
    data: { name: '待更新 Board', project_ids: [] },
  })
  await expect(response).toBeOK()
  const { id, version } = await response.json()
  await page.goto('/')
  const nav = boardNavigation(page)
  await nav.getByRole('button', { name: '待更新 Board', exact: true }).click()
  await nav.getByRole('button', { name: '編輯 Board：待更新 Board' }).click()
  const editor = page.getByRole('dialog', { name: '編輯 Board' })
  await editor.getByRole('textbox', { name: 'Board 名稱' }).fill('舊版本 Board')

  const updated = await request.post(`/api/boards/${id}`, {
    data: { name: '已更新 Board', project_ids: [], version },
  })
  await expect(updated).toBeOK()
  const save = editor.getByRole('button', { name: '儲存' })
  await save.click()
  await expect(editor.getByRole('alert')).toContainText('Board 已更新')
  await expect(save).toBeDisabled()
  await editor.getByRole('button', { name: '關閉' }).click()
  await expect(
    nav.getByRole('button', { name: '已更新 Board', exact: true }),
  ).toBeVisible()
})

test('主要導覽可混合排序 Board 和預設分頁，並記住隱藏今日', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/boards', {
    data: { name: '!排序測試 Board', project_ids: [] },
  })
  await expect(response).toBeOK()
  await page.goto('/')
  const nav = boardNavigation(page)
  const items = nav.getByRole('listitem')
  const board = nav.getByRole('button', {
    name: '!排序測試 Board',
    exact: true,
  })
  const handle = nav.getByRole('button', { name: '調整順序：!排序測試 Board' })
  await expect(
    items.nth(3).getByRole('button', { name: '!排序測試 Board', exact: true }),
  ).toBeVisible()
  await handle.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await expect(
    items.nth(2).getByRole('button', { name: '!排序測試 Board', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    items.nth(2).getByRole('button', { name: '!排序測試 Board', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  const showToday = page.getByRole('checkbox', {
    name: '顯示預設的「今日」分頁',
  })
  await showToday.uncheck()
  const today = nav.getByRole('button', { name: '今日任務' })
  await expect(today).toHaveCount(0)
  await page.reload()
  await expect(today).toHaveCount(0)
  await expect(board).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '後一天' }).click()
  await page.keyboard.press('Meta+k')
  await expect(board).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await showToday.check()
  await expect(today).toBeVisible()
  await expect(
    items.nth(2).getByRole('button', { name: '!排序測試 Board', exact: true }),
  ).toBeVisible()
})

test('從側欄編輯並刪除 Board，保留任務和 Project', async ({
  page,
  request,
}) => {
  const { id: projectId } = await (
    await request.post('/api/projects', {
      data: { name: 'Board 刪除測試用 Project' },
    })
  ).json()
  const { id: taskId } = await (
    await request.post('/api/tasks', {
      data: { title: '刪除 Board 仍需保留的任務', project_id: projectId },
    })
  ).json()
  await expect(
    await request.post('/api/boards', {
      data: { name: '待刪除 Board', project_ids: [projectId] },
    }),
  ).toBeOK()
  await page.goto('/')
  const nav = boardNavigation(page)
  const tab = nav.getByRole('button', { name: '待刪除 Board', exact: true })
  await tab.click()
  await tab.hover()
  await expect(
    page.getByRole('main').getByRole('button', { name: /編輯 Board/ }),
  ).toHaveCount(0)
  await nav.getByRole('button', { name: '編輯 Board：待刪除 Board' }).click()
  const editor = page.getByRole('dialog', { name: '編輯 Board' })
  const warn = page.getByRole('alertdialog', { name: '刪除 Board' })
  await editor.getByRole('button', { name: '刪除', exact: true }).click()
  await expect(warn).toContainText('無法復原')
  await expect(warn).toContainText('任務和所屬的 Projects 都會保留')
  await warn.getByRole('button', { name: '取消' }).click()
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: '刪除', exact: true }).click()
  await warn.getByRole('button', { name: '永久刪除' }).click()
  await expect(tab).toHaveCount(0)
  await expect(editor).toHaveCount(0)
  expect(
    await (await request.get(`/api/tasks/${taskId}`)).json(),
  ).toMatchObject({
    id: taskId,
    project_id: projectId,
  })
})
