import { expect, test } from '@playwright/test'
import type { Task } from '../src/lib/api'

test.use({ locale: 'zh-TW', timezoneId: 'Asia/Taipei' })

test('統計依 Project 篩選，依實際完成日期計算最近七天', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/projects', {
    data: { name: 'Stats project' },
  })
  expect(response.status()).toBe(201)
  const project = await response.json()
  await page.clock.setFixedTime(new Date('2026-11-26T02:00:00+08:00'))
  const tasks = [
    {
      id: 'open-overdue',
      scheduled_date: '2026-11-25',
      project_id: project.id,
    },
    { id: 'open-undated' },
    {
      id: 'completed-today',
      project_id: project.id,
      scheduled_date: '2026-10-01',
      completed_at: '2026-11-25T16:30:00Z',
    },
    { id: 'completed-yesterday', completed_at: '2026-11-25T15:30:00Z' },
    {
      id: 'completed-outside-window',
      project_id: project.id,
      completed_at: '2026-11-19T10:00:00Z',
    },
    {
      id: 'deleted',
      project_id: project.id,
      completed_at: '2026-11-25T16:30:00Z',
      deleted_at: '2026-11-25T17:00:00Z',
    },
  ] satisfies (Partial<Task> & Pick<Task, 'id'>)[]
  await page.route('**/api/tasks', (route) =>
    route.fulfill({
      json: tasks.map((task) => ({
        title: task.id,
        description: '',
        scheduled_date: '',
        completed_at: null,
        deleted_at: null,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-11-25T17:00:00Z',
        version: 1,
        links: [],
        ...task,
      })),
    }),
  )

  await page.goto('/')
  await page.getByRole('button', { name: '統計', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '統計', exact: true }),
  ).toBeVisible()
  const overview = page.getByRole('region', { name: '任務總覽' })
  const recent = page.getByRole('region', { name: '最近 7 天完成的任務' })
  const countFor = (date: string) =>
    recent
      .getByRole('listitem')
      .filter({ has: page.locator(`time[datetime="${date}"]`) })
      .locator('.task-statistics-day-count')
  await expect(overview.locator('dd')).toHaveText(['2', '3', '1'])
  await expect(recent.getByRole('listitem')).toHaveCount(7)
  await expect(countFor('2026-11-26')).toHaveText('1')
  await expect(countFor('2026-11-25')).toHaveText('1')
  await expect(countFor('2026-11-20')).toHaveText('0')

  const filter = page.getByRole('combobox', { name: 'Project' })
  await filter.selectOption({ label: 'Stats project' })
  await expect(overview.locator('dd')).toHaveText(['1', '2', '1'])
  await expect(countFor('2026-11-26')).toHaveText('1')
  await expect(countFor('2026-11-25')).toHaveText('0')

  await filter.selectOption({ label: '未分類' })
  await expect(overview.locator('dd')).toHaveText(['1', '1', '0'])
  await expect(countFor('2026-11-26')).toHaveText('0')
  await expect(countFor('2026-11-25')).toHaveText('1')
})
