import { expect, test } from '@playwright/test'

test('可從 Board 名稱旁開啟圖示選單，變更後同步到側欄和選單列', async ({
  page,
  context,
  request,
}) => {
  const name = '圖示測試 Board'
  const project = '圖示測試分類'
  await expect(
    await request.post('/api/projects', { data: { name: project } }),
  ).toBeOK()
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '主要導覽' })
  await nav.getByRole('button', { name: '新增 Board' }).click()
  const create = page.getByRole('dialog', { name: '新增 Board' })
  const nameInput = create.getByRole('textbox', { name: 'Board 名稱' })
  const defaultTrigger = create.getByRole('button', {
    name: 'Board 圖示：格狀（預設）',
  })
  const menu = page.getByRole('listbox', { name: 'Board 圖示' })
  const defaultIcon = menu.getByRole('option', { name: '格狀（預設）' })
  const briefcase = menu.getByRole('option', { name: '公事包' })
  await expect(nameInput).toBeFocused()
  await nameInput.fill(name)
  await expect(menu).toBeHidden()
  expect((await defaultTrigger.boundingBox())!.x).toBeLessThan(
    (await nameInput.boundingBox())!.x,
  )
  await defaultTrigger.press('ArrowDown')
  await expect(defaultIcon).toBeFocused()
  await expect(defaultIcon).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(briefcase).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(create).toBeVisible()
  await expect(defaultTrigger).toBeFocused()

  await defaultTrigger.click()
  await briefcase.click()
  await expect(
    create.getByRole('button', { name: 'Board 圖示：公事包' }),
  ).toBeVisible()
  await create.getByRole('checkbox', { name: project }).check()
  await create.getByRole('button', { name: '儲存' }).click()

  const board = nav.getByRole('button', { name, exact: true })
  const main = page.getByRole('main')
  const heading = main.getByRole('heading', { name, exact: true })
  const titleIcon = main.getByRole('button', { name: 'Board 圖示：公事包' })
  await expect(board.locator('svg.lucide-briefcase')).toBeVisible()
  await expect(titleIcon).toBeVisible()
  expect((await titleIcon.boundingBox())!.x).toBeLessThan(
    (await heading.boundingBox())!.x,
  )
  await titleIcon.click()
  await expect(briefcase).toHaveAttribute('aria-selected', 'true')
  await heading.click()
  await expect(menu).toBeHidden()
  await titleIcon.click()
  await menu.getByRole('option', { name: '星星' }).click()
  await expect(board.locator('svg.lucide-star')).toBeVisible()
  await expect(
    main.getByRole('button', { name: 'Board 圖示：星星' }),
  ).toBeVisible()
  await page.reload()
  await expect(board.locator('svg.lucide-star')).toBeVisible()

  const panel = await context.newPage()
  await panel.setViewportSize({ width: 360, height: 480 })
  await panel.goto('/menu-bar.html')
  await panel.getByRole('button', { name: /^選擇 Board：/ }).click()
  const choice = panel.getByRole('menuitemradio', { name, exact: true })
  await expect(choice.locator('svg.lucide-star')).toBeVisible()
  await choice.click()
  await expect(
    panel
      .getByRole('button', { name: `選擇 Board：${name}` })
      .locator('svg.lucide-star'),
  ).toBeVisible()
  await panel.close()

  await board.hover()
  await nav.getByRole('button', { name: `編輯 Board：${name}` }).click()
  const editor = page.getByRole('dialog', { name: '編輯 Board' })
  await expect(editor.getByRole('checkbox', { name: project })).toBeChecked()
  await editor.getByRole('button', { name: 'Board 圖示：星星' }).click()
  await expect(menu.getByRole('option', { name: '星星' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(defaultIcon).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: '儲存' }).click()
  await expect(board.locator('svg.lucide-layout-grid')).toBeVisible()
})
