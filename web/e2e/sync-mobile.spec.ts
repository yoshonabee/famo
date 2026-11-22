import { expect, test } from '@playwright/test'
import type { Task } from '../src/lib/api'
import type { Operation } from '../sync/sync-client'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ status: 404, json: { error: 'Not found' } }),
  )
})

const firstTask: Task = {
  id: '2196907089d602fd6d518a2790420672',
  title: 'Check the calendar',
  scheduled_date: '2026-11-22',
  description: 'Keep the desktop note',
  project_id: 'project-from-desktop',
  links: [{ url: 'https://example.com' }],
  created_at: '2026-11-22T08:30:00Z',
  updated_at: '2026-11-22T08:30:00Z',
  completed_at: null,
  deleted_at: null,
  version: 1,
}

test('retries an unconfirmed creation with the same operation after a reload', async ({
  page,
}) => {
  const operations: Operation[] = []
  await page.route('**/api/sync/pull?*', (route) => {
    const after = Number(
      new URL(route.request().url()).searchParams.get('after'),
    )
    return route.fulfill({
      json: { changes: [], cursor: after, has_more: false },
    })
  })
  await page.route('**/api/sync/push', (route) => {
    const operation: Operation = route.request().postDataJSON()
    operations.push(operation)
    if (operations.length === 1) return route.abort('failed')
    return route.fulfill({
      json: { change: { sequence: 1, task: operation.task } },
    })
  })

  await page.goto('/')
  await page.getByRole('textbox', { name: '新增任務' }).fill('Buy tomatoes')
  await page.getByRole('button', { name: '新增', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    '目前無法連線同步，請再試一次。',
  )
  await page.reload()
  await expect(page.getByRole('textbox', { name: '新增任務' })).toHaveValue(
    'Buy tomatoes',
  )
  await page.getByRole('button', { name: '重試儲存' }).click()
  await expect(
    page.getByRole('checkbox', { name: 'Buy tomatoes' }),
  ).toBeVisible()
  await expect(page.getByRole('textbox', { name: '新增任務' })).toHaveValue('')
  expect(operations).toHaveLength(2)
  expect(operations[0].base_version).toBe(0)
  expect(operations[1]).toEqual(operations[0])
})

test('applies the current task on conflict, preserves fields on completion and hides a tombstone', async ({
  page,
}) => {
  const changedTitle = 'Check the revised calendar'
  const remote = { ...firstTask, title: changedTitle, version: 2 }
  const changes = [{ sequence: 1, task: firstTask }]
  const operations: Operation[] = []
  await page.route('**/api/sync/pull?*', (route) => {
    const after = Number(
      new URL(route.request().url()).searchParams.get('after'),
    )
    const pending = changes.filter((change) => change.sequence > after)
    const pageSize = 1
    return route.fulfill({
      json: {
        changes: pending.slice(0, pageSize),
        cursor: pending[0]?.sequence ?? after,
        has_more: pending.length > pageSize,
      },
    })
  })
  await page.route('**/api/sync/push', (route) => {
    const operation: Operation = route.request().postDataJSON()
    operations.push(operation)
    if (operations.length === 1) {
      changes.push({ sequence: 2, task: remote })
      return route.fulfill({ status: 409, json: { current: remote } })
    }
    const change = { sequence: 3, task: operation.task }
    changes.push(change)
    return route.fulfill({ json: { change } })
  })

  await page.goto('/')
  await page.getByRole('checkbox', { name: firstTask.title }).click()
  await expect(page.getByRole('alert')).toContainText('已在其他裝置更新')
  const checkbox = page.getByRole('checkbox', {
    name: changedTitle,
    exact: true,
  })
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  expect(operations[1]).toMatchObject({
    base_version: 2,
    task: {
      project_id: firstTask.project_id,
      links: firstTask.links,
      scheduled_date: firstTask.scheduled_date,
      description: firstTask.description,
      version: 3,
    },
  })
  changes.push({
    sequence: 4,
    task: {
      ...operations[1].task,
      version: 4,
      deleted_at: '2026-11-22T09:00:00Z',
    },
  })
  await page.getByRole('button', { name: '同步', exact: true }).click()
  await expect(checkbox).toHaveCount(0)
})

test('preserves a Project draft and shows the latest version on conflict', async ({
  page,
}) => {
  const project = {
    id: 'project-1',
    name: 'Errands',
    color: '#64748B',
    position: null,
  }
  const remote = { ...project, name: 'Remote errands' }
  let snapshot = { version: 1, projects: [project], boards: [] }
  const revisions: number[] = []
  await page.route('**/api/sync/pull?*', (route) =>
    route.fulfill({ json: { changes: [], cursor: 0, has_more: false } }),
  )
  await page.route('**/api/sync/collections', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: snapshot })
    const operation = route.request().postDataJSON()
    revisions.push(operation.base_version)
    if (operation.base_version === 1) {
      snapshot = { ...snapshot, version: 2, projects: [remote] }
      return route.fulfill({ status: 409, json: { current: snapshot } })
    }
    snapshot = { ...snapshot, version: 3, projects: operation.projects }
    return route.fulfill({ json: snapshot })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '管理 Project 與 Board' }).click()
  await page.getByRole('button', { name: '編輯 Project Errands' }).click()
  const name = page.getByLabel('Project 名稱')
  const save = page.getByRole('button', { name: '儲存', exact: true })
  await name.fill('My errands')
  await save.click()
  await expect(page.getByText('最新版本：Remote errands')).toBeVisible()
  await expect(name).toHaveValue('My errands')
  await save.click()
  await expect(
    page.getByRole('button', { name: '編輯 Project My errands' }),
  ).toBeVisible()
  expect(revisions).toEqual([1, 2])
})
