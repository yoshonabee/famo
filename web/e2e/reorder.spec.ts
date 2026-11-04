import { expect, test } from '@playwright/test'

test('左側六點把手可拖曳、鍵盤排序，順序持久化且失敗回復', async ({
  page,
  request,
}) => {
  for (const suffix of ['A', 'B', 'C']) {
    const response = await request.post('/api/tasks', {
      data: { title: `拖曳測試 ${suffix}`, type: 'general', priority: 1 },
    })
    expect(response.status()).toBe(201)
  }
  await page.goto('/')
  await page.getByRole('textbox', { name: '搜尋任務' }).fill('拖曳測試')
  const ready = page.locator('.section-ready')
  const titles = ready.locator('input.todo-title')
  const expectTitles = (expected: string[]) =>
    expect
      .poll(() =>
        titles.evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLInputElement).value),
        ),
      )
      .toEqual(expected)
  await expectTitles(['拖曳測試 A', '拖曳測試 B', '拖曳測試 C'])
  const source = ready.getByRole('button', {
    name: '拖曳排序：拖曳測試 C',
    exact: true,
  })
  const first = ready.getByRole('textbox', {
    name: '編輯任務標題：拖曳測試 A',
    exact: true,
  })
  const from = (await source.boundingBox())!
  const to = (await first.boundingBox())!
  expect(from.x).toBeLessThan(to.x)
  const save = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/tasks/reorder') && r.request().method() === 'POST',
  )
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 12, { steps: 5 })
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2 - 5, {
    steps: 15,
  })
  await page.mouse.up()
  expect((await save).status()).toBe(200)
  await expectTitles(['拖曳測試 C', '拖曳測試 A', '拖曳測試 B'])
  await page.reload()
  await page.getByRole('textbox', { name: '搜尋任務' }).fill('拖曳測試')
  await expectTitles(['拖曳測試 C', '拖曳測試 A', '拖曳測試 B'])
  const keyboardSave = page.waitForResponse((r) =>
    r.url().endsWith('/api/tasks/reorder'),
  )
  await source.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  expect((await keyboardSave).status()).toBe(200)
  await expectTitles(['拖曳測試 A', '拖曳測試 C', '拖曳測試 B'])
  await page.route('**/api/tasks/reorder', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: '排序儲存失敗' }),
    }),
  )
  await source.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  await expect(page.getByRole('alert')).toContainText('順序未儲存')
  await expectTitles(['拖曳測試 A', '拖曳測試 C', '拖曳測試 B'])
  await page.reload()
  await page.getByRole('textbox', { name: '搜尋任務' }).fill('拖曳測試')
  await expectTitles(['拖曳測試 A', '拖曳測試 C', '拖曳測試 B'])
  // 新增任務應接在最後，不可把手動順序重新按建立時間排序。
  const capture = page.getByRole('textbox', { name: '快速新增任務名稱' })
  await capture.fill('拖曳測試 D')
  await capture.press('Enter')
  await expect(
    ready.getByRole('textbox', {
      name: '編輯任務標題：拖曳測試 D',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('textbox', { name: '搜尋任務' }).fill('拖曳測試')
  await expectTitles(['拖曳測試 A', '拖曳測試 C', '拖曳測試 B', '拖曳測試 D'])
  await page.getByRole('textbox', { name: '搜尋任務' }).fill('')
  await page.screenshot({
    path: '/private/tmp/famo-compact-desktop.png',
    fullPage: true,
  })
})
