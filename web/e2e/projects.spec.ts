import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    await expect(editor.getByRole('radio', { name: '隨機' })).toBeChecked()
    if (name === '網站改版')
      await editor.getByRole('radio', { name: '海藍' }).check()
    await editor.getByRole('button', { name: '儲存' }).click()
    await expect(editor).toBeHidden()
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  const websiteDot = nav
    .getByRole('button', { name: '網站改版', exact: true })
    .locator('.project-color-dot')
  await expect(websiteDot).toHaveCSS('background-color', 'rgb(79, 135, 204)')

  const input = page.getByRole('textbox', { name: '快速新增任務名稱' })
  await input.fill('整理家裡文件')
  await input.press('Enter')
  const open = (title: string) =>
    page.getByRole('button', { name: `任務詳情：${title}` })
  await open('整理家裡文件').click()
  const details = page.getByRole('dialog', { name: '整理家裡文件' })
  const project = details.getByRole('button', { name: 'Project', exact: true })
  await expect(project).toHaveText('生活雜事')
  expect((await project.boundingBox())?.height).toBe(
    (await details.getByRole('button', { name: /^任務日期：/ }).boundingBox())
      ?.height,
  )
  await project.press('Space')
  await expect(details.getByRole('option', { name: '生活雜事' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(details).toBeVisible()
  await expect(project).toBeFocused()
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
  await project.click()
  await details.getByRole('option', { name: '網站改版', exact: true }).click()
  await expect(project).toHaveText('網站改版')
  await details.getByRole('button', { name: '關閉', exact: true }).click()
  await nav.getByRole('button', { name: '網站改版', exact: true }).click()
  await expect(open('整理家裡文件')).toBeVisible()
  await page.getByRole('checkbox', { name: '完成任務：整理家裡文件' }).click()
  await expect(
    page
      .getByRole('list', { name: 'Project 已完成任務' })
      .getByRole('textbox', { name: '編輯任務標題：整理家裡文件' }),
  ).toBeVisible()

  const editWebsite = nav.getByRole('button', {
    name: '編輯 Project：網站改版',
  })
  await expect(editWebsite).toHaveCSS('opacity', '0')
  await nav.getByRole('button', { name: '網站改版', exact: true }).hover()
  await expect(editWebsite).toHaveCSS('opacity', '1')
  await editWebsite.click()
  const rename = page.getByRole('dialog', { name: '編輯 Project' })
  await rename.getByRole('textbox', { name: 'Project 名稱' }).fill('網站維護')
  await rename.getByRole('radio', { name: '自訂' }).check()
  await rename.getByRole('textbox', { name: 'Project 色碼' }).fill('#123456')
  await rename.getByRole('button', { name: '儲存' }).click()
  await expect(rename).toBeHidden()
  await expect(page.getByRole('heading', { name: '網站維護' })).toBeVisible()

  await page.reload()
  const updatedProject = nav.getByRole('button', {
    name: '網站維護',
    exact: true,
  })
  await expect(updatedProject.locator('.project-color-dot')).toHaveCSS(
    'background-color',
    'rgb(18, 52, 86)',
  )
  await updatedProject.click()
  await expect(open('整理家裡文件')).toBeVisible()
  await open('整理家裡文件').click()
  await project.click()
  await details.getByRole('option', { name: '未分類', exact: true }).click()
  await expect(project).toHaveText('未分類')
  await details.getByRole('button', { name: '關閉', exact: true }).click()
  await expect(open('整理家裡文件')).toHaveCount(0)
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(open('整理家裡文件')).toBeVisible()
})

test('側欄 Project 可拖曳與鍵盤排序，重載後保留順序', async ({
  page,
  request,
}) => {
  for (const suffix of ['A', 'B']) {
    const response = await request.post('/api/projects', {
      data: { name: `Sort Project ${suffix}` },
    })
    await expect(response).toBeOK()
  }
  await page.goto('/')
  const nav = page.getByRole('region', { name: 'Project 導覽' })
  const names = nav.getByText(/^Sort Project [AB]$/)
  await expect(names).toHaveText(['Sort Project A', 'Sort Project B'])
  const source = nav.getByRole('button', { name: '調整順序：Sort Project B' })
  const destination = nav.getByRole('button', {
    name: 'Sort Project A',
    exact: true,
  })
  await destination.scrollIntoViewIfNeeded()
  await source.scrollIntoViewIfNeeded()
  const from = (await source.boundingBox())!
  const to = (await destination.boundingBox())!
  const save = page.waitForResponse('**/api/projects/reorder')
  const x = from.x + from.width / 2
  await page.mouse.move(x, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, to.y + to.height / 2 - 5, { steps: 15 })
  await page.mouse.up()
  expect((await save).ok()).toBeTruthy()
  await expect(names).toHaveText(['Sort Project B', 'Sort Project A'])
  await page.reload()
  await expect(names).toHaveText(['Sort Project B', 'Sort Project A'])

  const keyboardSave = page.waitForResponse('**/api/projects/reorder')
  await source.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  expect((await keyboardSave).ok()).toBeTruthy()
  await expect(names).toHaveText(['Sort Project A', 'Sort Project B'])
})

test('Project 工作區可儲存、編輯及清除，任務脈絡會套用設定', async ({
  page,
  request,
}) => {
  const dir = await mkdtemp(join(tmpdir(), 'famo-project-workspace-'))
  try {
    await page.goto('/')
    const nav = page.getByRole('region', { name: 'Project 導覽' })
    await nav.getByRole('button', { name: '新增 Project' }).click()
    const create = page.getByRole('dialog', { name: '新增 Project' })
    await create.getByLabel('Project 名稱').fill('工作區測試')
    await create.getByText('Agent 工作區', { exact: true }).click()
    await create.getByLabel('工作區路徑').fill('relative/path')
    await create.getByRole('button', { name: '儲存' }).click()
    await expect(create.getByRole('alert')).toContainText('完整路徑')
    await create.getByLabel('工作區路徑').fill(dir)
    await create.getByLabel('工作區指引（選填）').fill('先看 Project README。')
    await create.getByRole('button', { name: '儲存' }).click()
    await expect(create).toBeHidden()

    const projects = await (await request.get('/api/projects')).json()
    const project = projects.find(
      (item: { name: string }) => item.name === '工作區測試',
    )
    const response = await request.post('/api/tasks', {
      data: { title: '檢查此 Project 的工作區', project_id: project.id },
    })
    await expect(response).toBeOK()
    const task = await response.json()
    const contextPath = `/api/tasks/${task.id}/context`
    expect((await (await request.get(contextPath)).json()).workspace).toEqual({
      dir,
      prompt: '先看 Project README。',
    })

    await page.reload()
    await nav.getByRole('button', { name: '工作區測試', exact: true }).hover()
    await nav.getByRole('button', { name: '編輯 Project：工作區測試' }).click()
    const edit = page.getByRole('dialog', { name: '編輯 Project' })
    await edit.getByText('Agent 工作區', { exact: true }).click()
    await expect(edit.getByLabel('工作區路徑')).toHaveValue(dir)
    await expect(edit.getByLabel('工作區指引（選填）')).toHaveValue(
      '先看 Project README。',
    )
    await edit.getByLabel('工作區路徑').clear()
    await edit.getByLabel('工作區指引（選填）').clear()
    await edit.getByRole('button', { name: '儲存' }).click()
    await expect(edit).toBeHidden()
    expect((await (await request.get(contextPath)).json()).workspace).toEqual({
      dir: '',
      prompt: '',
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('從側欄刪除 Project 會保留任務並移除 Board 的關聯', async ({
  page,
  request,
}) => {
  const { id: projectId } = await (
    await request.post('/api/projects', {
      data: { name: '即將刪除的 Project' },
    })
  ).json()
  const { id: taskId } = await (
    await request.post('/api/tasks', {
      data: { title: '刪除 Project 仍需保留的任務', project_id: projectId },
    })
  ).json()
  const { id: boardId } = await (
    await request.post('/api/boards', {
      data: { name: '刪除 Project 後保留的 Board', project_ids: [projectId] },
    })
  ).json()
  await page.goto('/')
  const sidebar = page.getByRole('region', { name: 'Project 導覽' })
  const project = sidebar.getByRole('button', {
    name: '即將刪除的 Project',
    exact: true,
  })
  await project.click()
  await project.hover()
  await expect(
    page.getByRole('main').getByRole('button', { name: /編輯 Project/ }),
  ).toHaveCount(0)
  await sidebar
    .getByRole('button', { name: '編輯 Project：即將刪除的 Project' })
    .click()
  await page
    .getByRole('dialog', { name: '編輯 Project' })
    .getByRole('button', { name: '刪除', exact: true })
    .click()
  const warn = page.getByRole('alertdialog', { name: '刪除 Project' })
  await expect(warn).toContainText('無法復原')
  await expect(warn).toContainText('所有任務都會保留')
  await warn.getByRole('button', { name: '永久刪除' }).click()
  await expect(project).toHaveCount(0)
  const task = await (await request.get(`/api/tasks/${taskId}`)).json()
  expect(task.title).toBe('刪除 Project 仍需保留的任務')
  expect(task.project_id).toBeUndefined()
  const boards = await (await request.get('/api/boards')).json()
  expect(boards).toContainEqual(
    expect.objectContaining({ id: boardId, project_ids: [] }),
  )
})
