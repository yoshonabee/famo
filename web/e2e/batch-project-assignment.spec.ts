import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test'

async function addTask(
  request: APIRequestContext,
  title: string,
  date: string,
) {
  const response = await request.post('/api/tasks', {
    data: { title, scheduled_date: date },
  })
  expect(response.ok()).toBeTruthy()
  return response.json()
}

function taskRow(page: Page, id: string) {
  return page.locator(`[data-selectable-task="${id}"]`)
}

async function dragRows(page: Page, from: Locator, to: Locator) {
  const first = await from.getByRole('textbox').boundingBox()
  const last = await to.getByRole('textbox').boundingBox()
  if (!first || !last) throw new Error('Task titles are outside the viewport')
  await page.mouse.move(first.x + 18, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(last.x + 18, last.y + last.height / 2, { steps: 10 })
  await page.mouse.up()
}

test('拖曳、Shift 和 Command 選取任務，完成按鈕仍可操作', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const date = (await page.locator('h1 time').getAttribute('datetime'))!
  for (const suffix of ['A', 'B', 'C', 'D']) {
    await addTask(request, `gesture task ${suffix}`, date)
  }
  await page.reload()
  await page.getByLabel('搜尋任務').fill('gesture task')
  const rows = page.locator('[data-selectable-task]')
  await expect(rows).toHaveCount(4)
  const selected = page.locator('[data-batch-selected]')
  const toolbar = page.getByRole('region', { name: '任務批次操作' })
  await expect(toolbar).toBeHidden()

  await dragRows(page, rows.nth(0), rows.nth(2))
  await expect(selected).toHaveCount(3)
  await expect(rows.nth(3)).not.toHaveAttribute('data-batch-selected')
  await expect(toolbar.getByRole('status')).toHaveText('已選取 3 件任務')
  await expect(toolbar).toHaveCSS('position', 'fixed')
  await expect(rows.nth(0).getByRole('textbox')).not.toBeFocused()
  await expect(
    rows.nth(0).getByRole('checkbox', { name: /完成任務/ }),
  ).not.toBeChecked()

  await rows
    .nth(1)
    .getByRole('textbox')
    .click({ modifiers: ['Meta'] })
  await expect(rows.nth(1)).not.toHaveAttribute('data-batch-selected')
  await expect(selected).toHaveCount(2)
  await rows
    .nth(3)
    .getByRole('textbox')
    .click({ modifiers: ['Shift'] })
  await expect(rows.nth(0)).not.toHaveAttribute('data-batch-selected')
  await expect(rows.nth(1)).toHaveAttribute('data-batch-selected', 'true')
  await expect(rows.nth(3)).toHaveAttribute('data-batch-selected', 'true')

  const lastTitle = await rows.nth(3).getByRole('textbox').inputValue()
  await rows
    .nth(3)
    .getByRole('checkbox', { name: `完成任務：${lastTitle}` })
    .click()
  await expect(
    page.getByRole('checkbox', { name: `恢復任務：${lastTitle}` }),
  ).toBeChecked()
  await expect(toolbar.getByRole('status')).toHaveText('已選取 3 件任務')
  await toolbar.getByRole('button', { name: '清除選取' }).click()
  await expect(toolbar).toBeHidden()

  await rows.nth(0).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(toolbar.getByRole('status')).toHaveText('已選取 2 件任務')
  await page.keyboard.press('Escape')
  await expect(toolbar).toBeHidden()

  const title = rows.nth(0).getByRole('textbox')
  await title.click()
  await expect(title).toBeFocused()
  await rows
    .nth(2)
    .getByRole('textbox')
    .click({ modifiers: ['Shift'] })
  await expect(toolbar.getByRole('status')).toHaveText('已選取 3 件任務')
  await page.keyboard.press('Escape')
  await title.click()
  await title.fill('gesture task renamed')
  await title.press('Enter')
  await expect(
    page.getByRole('textbox', { name: '編輯任務標題：gesture task renamed' }),
  ).toBeVisible()
  await expect(toolbar).toBeHidden()
})

test('拖曳到畫面底部時會捲動並延伸任務選取', async ({ page, request }) => {
  await page.setViewportSize({ width: 1000, height: 420 })
  await page.goto('/')
  const date = (await page.locator('h1 time').getAttribute('datetime'))!
  for (let index = 0; index < 20; index++)
    await addTask(request, `scroll select ${index}`, date)
  await page.reload()
  await page.getByLabel('搜尋任務').fill('scroll select')
  const rows = page.locator('[data-selectable-task]')
  await expect(rows).toHaveCount(20)
  const title = (await rows.first().getByRole('textbox').boundingBox())!
  const x = title.x + 18
  await page.mouse.move(x, title.y + title.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, 410, { steps: 10 })
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100)
  await expect
    .poll(() => page.locator('[data-batch-selected]').count())
    .toBeGreaterThan(6)
  await page.mouse.up()
  await expect(page.locator('[data-drag-selecting]')).toHaveCount(0)
})

test('點擊清單旁的空白或按 Escape 可清除選取', async ({ page, request }) => {
  await page.goto('/')
  const date = (await page.locator('h1 time').getAttribute('datetime'))!
  const task = await addTask(request, 'selection dismissal task', date)
  await page.reload()
  const search = page.getByRole('textbox', { name: '搜尋任務' })
  await search.fill(task.title)
  const row = taskRow(page, task.id)
  const title = row.getByRole('textbox')
  const toolbar = page.getByRole('region', { name: '任務批次操作' })
  const select = async () => {
    await title.click({ modifiers: ['Meta'] })
    await expect(toolbar).toBeVisible()
  }

  await select()
  const main = (await page.getByRole('main').boundingBox())!
  const bounds = (await row.boundingBox())!
  await page.mouse.click(main.x + 5, bounds.y + bounds.height / 2)
  await expect(toolbar).toBeHidden()

  await select()
  await search.focus()
  await page.keyboard.press('Escape')
  await expect(toolbar).toBeHidden()
  await expect(search).toHaveValue(task.title)

  await select()
  await title.fill('Unsaved title edit')
  await title.press('Escape')
  await expect(toolbar).toBeHidden()
  await expect(title).toHaveValue(task.title)
})

test.describe('手機上的任務多選', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })

  test('長按切換選取，浮動操作列保持在畫面內', async ({
    browserName,
    page,
    request,
  }) => {
    test.skip(browserName !== 'chromium', 'Touch hold uses Chromium DevTools')
    await page.goto('/')
    const date = (await page.locator('h1 time').getAttribute('datetime'))!
    const first = await addTask(request, 'touch select A', date)
    const second = await addTask(request, 'touch select B', date)
    await page.reload()
    await page.getByLabel('搜尋任務').fill('touch select')
    const toolbar = page.getByRole('region', { name: '任務批次操作' })
    const cdp = await page.context().newCDPSession(page)
    async function hold(id: string, expected: number) {
      const title = taskRow(page, id).getByRole('textbox')
      await title.scrollIntoViewIfNeeded()
      const bounds = (await title.boundingBox())!
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        ],
      })
      await expect(toolbar.getByRole('status')).toHaveText(
        `已選取 ${expected} 件任務`,
      )
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      await expect(title).not.toBeFocused()
    }
    await hold(first.id, 1)
    await hold(second.id, 2)
    const bounds = (await toolbar.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844)
    await hold(first.id, 1)
  })
})

test('從浮動操作列批次指派和清除歸屬，版本衝突時整批保留', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const date = (await page.locator('h1 time').getAttribute('datetime'))!
  const projectName = '批次指派的 Project'
  const projectResponse = await request.post('/api/projects', {
    data: { name: projectName },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json()
  const first = await addTask(request, 'batch-target A', date)
  const second = await addTask(request, 'batch-target B', date)
  const excluded = await addTask(request, 'batch-excluded', date)
  const completed = await request.post(`/api/tasks/${second.id}/actions`, {
    data: { op: 'complete_task', version: second.version },
  })
  expect(completed.ok()).toBeTruthy()
  const completedTask = await completed.json()

  await page.reload()
  await page.getByLabel('搜尋任務').fill('batch-target')
  const toolbar = page.getByRole('region', { name: '任務批次操作' })
  await taskRow(page, first.id)
    .getByRole('textbox')
    .click({ modifiers: ['Meta'] })
  const assign = toolbar.getByRole('button', { name: '指派', exact: true })
  const target = toolbar.getByRole('combobox', { name: '指派目標 Project' })
  await expect(assign).toBeDisabled()
  await toolbar.getByRole('button', { name: '全選可見任務' }).click()
  await expect(toolbar.getByRole('status')).toHaveText('已選取 2 件任務')
  await expect(taskRow(page, second.id)).toHaveAttribute(
    'data-batch-selected',
    'true',
  )
  await target.selectOption(project.id)

  const changed = await request.post(`/api/tasks/${second.id}/actions`, {
    data: {
      op: 'update',
      description: '外部更新',
      version: completedTask.version,
    },
  })
  expect(changed.ok()).toBeTruthy()
  await assign.click()
  await expect(page.getByRole('alert')).toContainText('任務已被更新')
  await expect(toolbar.getByRole('status')).toHaveText('已選取 2 件任務')
  const savedTask = async (id: string) =>
    (await request.get(`/api/tasks/${id}`)).json()
  expect((await savedTask(first.id)).project_id).toBeUndefined()
  expect((await savedTask(second.id)).project_id).toBeUndefined()

  await assign.click()
  await expect(toolbar).toBeHidden()
  expect((await savedTask(first.id)).project_id).toBe(project.id)
  expect((await savedTask(second.id)).project_id).toBe(project.id)
  expect((await savedTask(excluded.id)).project_id).toBeUndefined()

  await page.getByRole('button', { name: projectName, exact: true }).click()
  await taskRow(page, first.id)
    .getByRole('textbox')
    .click({ modifiers: ['Meta'] })
  await taskRow(page, second.id)
    .getByRole('textbox')
    .click({ modifiers: ['Shift'] })
  await expect(toolbar.getByRole('status')).toHaveText('已選取 2 件任務')
  await target.selectOption({ label: '未分類' })
  await assign.click()
  await expect(page.getByText('尚無任務', { exact: true })).toBeVisible()
  expect((await savedTask(first.id)).project_id).toBeUndefined()
  expect((await savedTask(second.id)).project_id).toBeUndefined()
  expect((await savedTask(second.id)).completed_at).toBe(
    completedTask.completed_at,
  )
})
