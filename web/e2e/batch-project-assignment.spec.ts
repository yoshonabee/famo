import { expect, test } from '@playwright/test'

test('從日期和 Project 清單批次指派與清除歸屬，版本衝突時整批保留', async ({
  page,
  request,
}) => {
  await page.goto('/')
  const date = await page.locator('h1 time').getAttribute('datetime')
  const projectName = '批次指派的 Project'
  const projectResponse = await request.post('/api/projects', {
    data: { name: projectName },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json()
  const createTask = async (title: string) => {
    const response = await request.post('/api/tasks', {
      data: { title, scheduled_date: date },
    })
    expect(response.ok()).toBeTruthy()
    return response.json()
  }
  const first = await createTask('batch-target A')
  const second = await createTask('batch-target B')
  const excluded = await createTask('batch-excluded')
  const completed = await request.post(`/api/tasks/${second.id}/actions`, {
    data: { op: 'complete_task', version: second.version },
  })
  expect(completed.ok()).toBeTruthy()
  const completedTask = await completed.json()

  await page.reload()
  await page.getByLabel('搜尋任務').fill('batch-target')
  const start = page.getByRole('button', { name: '多選任務', exact: true })
  await start.click()
  const selectAll = page.getByRole('checkbox', { name: '全選可見任務' })
  const selectTask = (title: string) =>
    page.getByRole('checkbox', { name: `選取任務：${title}`, exact: true })
  const assign = (count: number) =>
    page.getByRole('button', { name: `指派（${count}）`, exact: true })
  const target = page.getByRole('combobox', { name: '指派目標 Project' })
  await expect(assign(0)).toBeDisabled()
  await selectTask(first.title).click()
  await expect(selectAll).toHaveAttribute('aria-checked', 'mixed')
  await selectAll.click()
  await expect(selectTask(second.title)).toBeChecked()
  await target.selectOption(project.id)

  const changed = await request.post(`/api/tasks/${second.id}/actions`, {
    data: {
      op: 'update',
      description: '外部更新',
      version: completedTask.version,
    },
  })
  expect(changed.ok()).toBeTruthy()
  await assign(2).click()
  await expect(page.getByRole('alert')).toContainText('任務已被更新')
  await expect(selectTask(first.title)).toBeChecked()
  await expect(selectTask(second.title)).toBeChecked()
  const savedTask = async (id: string) =>
    (await request.get(`/api/tasks/${id}`)).json()
  expect((await savedTask(first.id)).project_id).toBeUndefined()
  expect((await savedTask(second.id)).project_id).toBeUndefined()

  await assign(2).click()
  await expect(start).toBeVisible()
  expect((await savedTask(first.id)).project_id).toBe(project.id)
  expect((await savedTask(second.id)).project_id).toBe(project.id)
  expect((await savedTask(excluded.id)).project_id).toBeUndefined()

  await page.getByRole('button', { name: projectName, exact: true }).click()
  await start.click()
  await selectAll.click()
  await target.selectOption({ label: '未分類' })
  await assign(2).click()
  await expect(page.getByText('尚無任務', { exact: true })).toBeVisible()
  expect((await savedTask(first.id)).project_id).toBeUndefined()
  expect((await savedTask(second.id)).project_id).toBeUndefined()
  expect((await savedTask(second.id)).completed_at).toBe(
    completedTask.completed_at,
  )
})
