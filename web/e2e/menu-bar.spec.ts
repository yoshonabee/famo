import { expect, test } from '@playwright/test'
import type { Task } from '../src/lib/api'

test.use({ timezoneId: 'Asia/Taipei', viewport: { width: 360, height: 480 } })

test('panel counts scheduled local tasks, reflects API edits and rolls over at midnight', async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date('2040-01-10T04:00:00Z') })
  const create = async (title: string, scheduled_date: string) => {
    const response = await request.post('/api/tasks', {
      data: { title, scheduled_date },
    })
    expect(response.ok()).toBe(true)
    return (await response.json()) as Task
  }
  const first = await create('整理今天的想法', '2040-01-10')
  const second = await create('喝一杯水', '2040-01-10')
  await create('明天的任務', '2040-01-11')
  await create('先前的任務', '2040-01-09')
  await create('還沒安排的任務', '')
  await request.post(`/api/tasks/${second.id}/actions`, {
    data: { op: 'complete_task', version: second.version },
  })
  await page.goto('/?view=menu-bar')
  const list = page.getByRole('list', { name: '今日任務列表' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('status')).toHaveText('已完成 1 / 2 件')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1')
  await expect(page.locator('.menu-bar-progress')).toContainText('50%')
  await expect(list.getByRole('listitem').first()).toContainText(first.title)
  await page.screenshot({ path: '/private/tmp/famo-menu-bar-light.png' })
  await request.post(`/api/tasks/${first.id}/actions`, {
    data: { op: 'complete_task', version: first.version },
  })
  await page.clock.runFor(2_100)
  await expect(page.getByRole('status')).toContainText('已完成 2 / 2 件')
  await page.clock.setSystemTime(new Date('2040-01-10T16:00:00Z'))
  await page.clock.runFor(1_100)
  await expect(page.locator('time')).toHaveAttribute('datetime', '2040-01-11')
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toContainText('明天的任務')
  await expect(page.getByRole('status')).toHaveText('已完成 0 / 1 件')
})

test('empty panel follows theme changes and Open Famo returns to the main app', async ({
  page,
  context,
}) => {
  await page.clock.install({ time: new Date('2041-02-03T04:00:00Z') })
  await page.goto('/?view=menu-bar')
  await expect(page.getByRole('status')).toHaveText('今天還沒有安排任務')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0')
  const other = await context.newPage()
  await other.goto('/')
  await other.getByRole('button', { name: '設定', exact: true }).click()
  await other.getByRole('radio', { name: '午夜', exact: true }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight')
  await expect(page.locator('.menu-bar-panel')).toHaveCSS(
    'background-color',
    'rgb(30, 40, 56)',
  )
  await expect(
    page.getByRole('button', { name: 'Open Famo', exact: true }),
  ).toHaveCSS('background-color', 'rgb(145, 185, 242)')
  await page.screenshot({ path: '/private/tmp/famo-menu-bar-dark.png' })
  await other.close()
  await page.getByRole('button', { name: 'Open Famo', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('button', { name: '今日任務', exact: true }),
  ).toBeVisible()
})

test('failed reads show an error and retry recovers without claiming an empty day', async ({
  page,
}) => {
  await page.route('**/api/tasks', (route) =>
    route.fulfill({ status: 500, json: { error: 'read failed' } }),
  )
  await page.goto('/?view=menu-bar')
  await expect(page.getByRole('alert')).toContainText('無法讀取任務')
  await expect(page.getByRole('status')).toHaveText('今日進度暫時無法更新')
  await expect(page.locator('.menu-bar-progress')).toContainText('—')
  await page.unroute('**/api/tasks')
  await page.route('**/api/tasks', (route) => route.fulfill({ json: [] }))
  await page.getByRole('button', { name: '重試', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('今天還沒有安排任務')
})
