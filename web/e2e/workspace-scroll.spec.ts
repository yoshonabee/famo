import { expect, test } from '@playwright/test'

test('桌面側欄與主要內容各自捲動，導覽快捷鍵只重設主要內容', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1000, height: 420 })
  await page.goto('/')
  const date = (await page.locator('h1 time').getAttribute('datetime'))!
  for (let index = 0; index < 20; index++) {
    const project = await request.post('/api/projects', {
      data: { name: `Scroll project ${index}` },
    })
    expect(project.ok()).toBeTruthy()
    const task = await request.post('/api/tasks', {
      data: { title: `Scroll workspace task ${index}`, scheduled_date: date },
    })
    expect(task.ok()).toBeTruthy()
  }
  await page.reload()
  await page.getByLabel('搜尋任務').fill('Scroll workspace task')
  await expect(page.locator('[data-selectable-task]')).toHaveCount(20)

  const sidebar = page.locator('.sidebar-scroll')
  const main = page.getByRole('main')
  const sidebarPosition = () => sidebar.evaluate((el) => el.scrollTop)
  const mainPosition = () => main.evaluate((el) => el.scrollTop)
  await sidebar.hover()
  await page.mouse.wheel(0, 300)
  await expect.poll(sidebarPosition).toBeGreaterThan(100)
  expect(await mainPosition()).toBe(0)
  const sidebarOffset = await sidebarPosition()

  await main.hover()
  await page.mouse.wheel(0, 300)
  await expect.poll(mainPosition).toBeGreaterThan(100)
  expect(await sidebarPosition()).toBe(sidebarOffset)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.locator('.sidebar-heading .brand')).toBeInViewport()
  await expect(
    page.getByRole('button', { name: '設定', exact: true }),
  ).toBeInViewport()

  await page.keyboard.press('Meta+k')
  await expect.poll(mainPosition).toBe(0)
  expect(await sidebarPosition()).toBe(sidebarOffset)
})
