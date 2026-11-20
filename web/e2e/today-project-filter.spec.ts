import { expect, test } from '@playwright/test'

test('今日依 Project 篩選各區段並記住選擇', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00'))
  const projects = [
    { id: 'work', name: '工作', color: '#4F87CC', version: 1 },
    { id: 'personal', name: '生活', color: '#4F9D69', version: 1 },
  ]
  const tasks = [
    { title: '今日工作', project_id: 'work', scheduled_date: '2026-11-20' },
    {
      title: '完成工作',
      project_id: 'work',
      scheduled_date: '2026-11-20',
      completed_at: '2026-11-20T08:00:00Z',
    },
    { title: '先前工作', project_id: 'work', scheduled_date: '2026-11-19' },
    { title: '未定工作', project_id: 'work', scheduled_date: '' },
    { title: '未定生活', project_id: 'personal', scheduled_date: '' },
    { title: '今日生活', project_id: 'personal', scheduled_date: '2026-11-20' },
    { title: '今日雜事', scheduled_date: '2026-11-20' },
  ].map((task, index) => ({
    id: `test-task-${index}`,
    created_at: '2026-11-19T08:00:00Z',
    updated_at: '2026-11-19T08:00:00Z',
    completed_at: null,
    deleted_at: null,
    version: 1,
    description: '',
    links: [],
    ...task,
  }))
  await page.route('**/api/projects', (route) =>
    route.fulfill({ json: projects }),
  )
  await page.route('**/api/tasks', (route) => route.fulfill({ json: tasks }))
  await page.goto('/')
  const filter = page.locator('summary').filter({ hasText: '篩選 Project' })
  const task = (title: string) =>
    page.getByRole('textbox', { name: `編輯任務標題：${title}` })
  await expect(task('完成工作')).toBeVisible()
  await filter.click()
  await page.getByRole('checkbox', { name: '工作', exact: true }).uncheck()
  await expect(task('今日工作')).toHaveCount(0)
  await expect(task('完成工作')).toHaveCount(0)
  await expect(task('今日生活')).toBeVisible()
  await expect(task('今日雜事')).toBeVisible()
  await expect(page.getByText('已完成 0 / 2', { exact: true })).toBeVisible()
  await expect(
    page.locator('summary').filter({ hasText: '先前未完成' }),
  ).toContainText('0')
  await page.locator('summary').filter({ hasText: '未指定日期' }).click()
  await expect(task('未定工作')).toHaveCount(0)
  await expect(task('未定生活')).toBeVisible()
  await page.getByRole('checkbox', { name: '未分類', exact: true }).uncheck()
  await expect(task('今日雜事')).toHaveCount(0)

  await page.reload()
  await expect(task('今日生活')).toBeVisible()
  await expect(task('今日工作')).toHaveCount(0)
  await expect(task('今日雜事')).toHaveCount(0)
  await page.getByRole('button', { name: '前一天' }).click()
  await expect(filter).toHaveCount(0)
  await expect(task('先前工作')).toBeVisible()

  await page.getByRole('button', { name: '今日任務', exact: true }).click()
  await expect(task('今日工作')).toHaveCount(0)
  await filter.click()
  await page.getByRole('button', { name: '顯示全部' }).click()
  await expect(task('今日工作')).toBeVisible()
  await expect(task('今日雜事')).toBeVisible()
})
