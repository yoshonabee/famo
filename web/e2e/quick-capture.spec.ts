import { expect, test } from '@playwright/test'

test('Enter 連續新增，不等待上一列儲存，名稱以外皆可留白', async ({
  page,
  request,
}) => {
  let releaseFirst!: () => void
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  await page.route('**/api/tasks', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().title === '快速記下：整理筆記'
    )
      await firstResponse
    await route.continue()
  })
  await page.goto('/')
  const capture = page.getByRole('region', {
    name: '快速新增任務',
    exact: true,
  })
  const input = capture.getByRole('textbox', { name: '快速新增任務名稱' })
  await input.focus()
  await expect(input).toBeFocused()
  await input.fill('快速記下：整理筆記')
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  const mainList = page.getByRole('list', {
    name: '當日未完成任務',
    exact: true,
  })
  await expect(mainList.getByText('儲存中', { exact: true })).toBeVisible()
  await expect(capture.locator('li')).toHaveCount(0)
  await input.fill('- [ ] 快速記下：回覆訊息')
  await input.press('Enter')
  await expect(
    mainList.getByRole('textbox', {
      name: '編輯任務標題：快速記下：回覆訊息',
      exact: true,
    }),
  ).toBeVisible()
  await input.fill('第三件先保留草稿')
  releaseFirst()
  await expect(
    mainList.getByRole('textbox', {
      name: '編輯任務標題：快速記下：整理筆記',
      exact: true,
    }),
  ).toBeVisible()
  await expect(input).toHaveValue('第三件先保留草稿')
  await expect(input).toBeFocused()
  // 輸入區只保留一個輸入框，儲存中的列和已儲存任務都在下方。
  await expect(capture.locator('li')).toHaveCount(0)
  const row = mainList.locator('.task-row').filter({
    has: page.getByRole('textbox', {
      name: '編輯任務標題：快速記下：整理筆記',
      exact: true,
    }),
  })
  await expect(row.locator('.parent-chip')).toHaveCount(0)
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(48)
  const checkbox = row.getByRole('checkbox', {
    name: '完成任務：快速記下：整理筆記',
  })
  expect(
    await checkbox.evaluate((el) =>
      parseFloat(getComputedStyle(el).borderRadius),
    ),
  ).toBeLessThanOrEqual(3)
  const tasks = await (await request.get('/api/tasks')).json()
  const saved = tasks.filter((task: { title: string }) =>
    task.title.startsWith('快速記下：'),
  )
  expect(saved).toHaveLength(2)
  for (const task of saved) {
    expect(task.description).toBe('')
    expect(task.links).toEqual([])
    expect(task.version).toBe(1)
  }
  await row
    .getByRole('button', { name: '任務詳情：快速記下：整理筆記', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: '快速記下：整理筆記', exact: true }),
  ).toBeVisible()
  // 不補 context 也能完成任務。
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await checkbox.click()
  await expect(row).not.toBeVisible()
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(capture).toBeHidden()
  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await expect(input).toHaveValue('第三件先保留草稿')
  await expect(capture.locator('li')).toHaveCount(0)
  await page.reload()
  await expect(
    page
      .getByRole('list', { name: '當日未完成任務', exact: true })
      .getByRole('textbox', {
        name: '編輯任務標題：快速記下：回覆訊息',
        exact: true,
      }),
  ).toBeVisible()
})

test('中文選字與空白 Enter 不送出；失敗保留原列，手機可重試', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let attempts = 0
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    attempts++
    if (attempts === 1)
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: '暫時無法儲存' }),
      })
    await route.continue()
  })
  await page.goto('/')
  const capture = page.getByRole('region', {
    name: '快速新增任務',
    exact: true,
  })
  const input = capture.getByRole('textbox', { name: '快速新增任務名稱' })
  const mainList = page.getByRole('list', {
    name: '當日未完成任務',
    exact: true,
  })
  await input.fill('   ')
  await input.press('Enter')
  await input.fill('- [ ] ')
  await input.press('Enter')
  await input.fill('中文輸入尚在選字')
  await input.dispatchEvent('compositionstart')
  await input.press('Enter')
  await expect(input).toHaveValue('中文輸入尚在選字')
  await input.dispatchEvent('compositionend')
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 })
  expect(attempts).toBe(0)
  await input.fill('快速記下：保留失敗內容')
  await input.press('Enter')
  await expect(mainList.getByRole('alert')).toContainText('暫時無法儲存')
  await expect(
    mainList.getByText('快速記下：保留失敗內容', { exact: true }),
  ).toBeVisible()
  await input.fill('下一行還在輸入')
  await mainList.getByRole('button', { name: '重試', exact: true }).click()
  await expect(
    mainList.getByRole('textbox', {
      name: '編輯任務標題：快速記下：保留失敗內容',
      exact: true,
    }),
  ).toBeVisible()
  await expect(input).toHaveValue('下一行還在輸入')
  expect(attempts).toBe(2)
  await input.fill('快速記下：手機按鈕新增')
  await capture.getByRole('button', { name: '新增這一列' }).click()
  await expect(
    mainList.getByRole('textbox', {
      name: '編輯任務標題：快速記下：手機按鈕新增',
      exact: true,
    }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '/private/tmp/famo-quick-capture-mobile.png',
    fullPage: true,
  })
})

test('⌘T 可選擇其他 Project，重新開啟沿用目前 Project', async ({
  page,
  request,
}) => {
  const source = await request.post('/api/projects', {
    data: { name: '浮窗預設 Project' },
  })
  const target = await request.post('/api/projects', {
    data: { name: '浮窗指定 Project' },
  })
  expect(source.ok() && target.ok()).toBe(true)
  const { id: targetId } = await target.json()

  await page.goto('/')
  await page
    .getByRole('button', { name: '浮窗預設 Project', exact: true })
    .click()
  await page.keyboard.press('Meta+t')
  const dialog = page.getByRole('dialog', { name: '快速新增任務' })
  const picker = dialog.getByRole('button', { name: '任務 Project' })
  const projects = dialog.getByRole('listbox', { name: '任務 Project' })
  await expect(picker).toHaveText('浮窗預設 Project')
  await picker.press('ArrowDown')
  await expect(projects.getByRole('option', { selected: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(projects).toBeHidden()
  await expect(picker).toBeFocused()
  await expect(dialog).toBeVisible()

  await picker.click()
  await projects.getByRole('option', { name: '浮窗指定 Project' }).click()
  const input = dialog.getByRole('textbox', { name: '快速新增任務名稱' })
  await expect(input).toBeFocused()
  await input.fill('浮窗指定任務分類')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tasks') &&
      response.request().method() === 'POST' &&
      response.ok(),
  )
  await input.press('Enter')
  expect(await (await saved).json()).toMatchObject({
    title: '浮窗指定任務分類',
    project_id: targetId,
  })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Meta+t')
  await expect(picker).toHaveText('浮窗預設 Project')
})

test('多 Project Board 可選擇其中一個 Project 來新增任務', async ({
  page,
  request,
}) => {
  const names = [
    '新增用採買 Project',
    '新增用生活 Project',
    'Board 以外的 Project',
  ]
  const ids: string[] = []
  for (const name of names) {
    const project = await request.post('/api/projects', { data: { name } })
    expect(project.ok()).toBe(true)
    ids.push((await project.json()).id)
  }
  const boardName = '多 Project 新增測試 Board'
  const board = await request.post('/api/boards', {
    data: { name: boardName, project_ids: ids.slice(0, 2) },
  })
  expect(board.ok()).toBe(true)

  await page.goto('/')
  await page.getByRole('button', { name: boardName, exact: true }).click()
  await page.getByRole('button', { name: '前一天' }).click()
  const date = await page.locator('.board-date time').getAttribute('datetime')
  const add = page.getByRole('button', { name: '新增任務', exact: true })
  await add.click()
  const dialog = page.getByRole('dialog', { name: '快速新增任務' })
  const input = dialog.getByRole('textbox', { name: '快速新增任務名稱' })
  const picker = dialog.getByRole('button', { name: '任務 Project' })
  const projects = dialog.getByRole('listbox', { name: '任務 Project' })
  const title = '從多 Project Board 新增的任務'
  await input.fill(title)
  await input.press('Enter')
  await expect(input).toHaveValue(title)
  await expect(
    dialog.getByRole('button', { name: '新增這一列' }),
  ).toBeDisabled()
  await picker.click()
  await expect(projects.getByRole('option')).toHaveCount(2)
  await projects.getByRole('option', { name: names[1] }).click()
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tasks') &&
      response.request().method() === 'POST' &&
      response.ok(),
  )
  await input.press('Enter')
  expect(await (await saved).json()).toMatchObject({
    title,
    scheduled_date: date,
    project_id: ids[1],
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: boardName })).toBeVisible()
  await expect(page.getByLabel(`編輯任務標題：${title}`)).toBeVisible()
  await page.keyboard.press('Meta+t')
  await expect(picker).toHaveText('選擇 Project')
  await expect(
    dialog.getByRole('button', { name: `任務日期 ${date}` }),
  ).toBeVisible()
})
