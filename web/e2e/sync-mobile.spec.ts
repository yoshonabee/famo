import { expect, test } from '@playwright/test'
import type { Task } from '../src/lib/api'
import type { Operation } from '../src/lib/cloud-transport'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({
      json: {
        version: 1,
        projects: [
          {
            id: 'project-from-desktop',
            name: 'Planning',
            color: '#64748B',
            position: null,
          },
        ],
        boards: [],
      },
    }),
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

test('keeps the quick-capture sheet above the mobile keyboard', async ({
  page,
}) => {
  await page.route('**/api/sync/pull?*', (route) =>
    route.fulfill({ json: { changes: [], cursor: 0, has_more: false } }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: '快速新增任務', exact: true }).tap()
  const sheet = page.getByRole('dialog', { name: '快速新增任務' })
  await expect(
    sheet.getByRole('textbox', { name: '快速新增任務名稱' }),
  ).toBeFocused()

  const sheetBottom = () =>
    sheet.evaluate((el) => el.getBoundingClientRect().bottom)
  const screenBottom = await page.evaluate(() => window.innerHeight)
  await expect.poll(sheetBottom).toBeCloseTo(screenBottom, 0)

  // Playwright has no native keyboard. Model the visual viewport changes it causes.
  await page.evaluate(() => {
    const viewport = window.visualViewport!
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      value: 320,
    })
    viewport.dispatchEvent(new Event('resize'))
  })
  await expect.poll(sheetBottom).toBeCloseTo(320, 0)

  await page.evaluate(() => {
    const viewport = window.visualViewport!
    Object.defineProperty(viewport, 'offsetTop', {
      configurable: true,
      value: 48,
    })
    viewport.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(sheetBottom).toBeCloseTo(368, 0)

  await page.evaluate(() => {
    const viewport = window.visualViewport!
    Reflect.deleteProperty(viewport, 'height')
    Reflect.deleteProperty(viewport, 'offsetTop')
    viewport.dispatchEvent(new Event('resize'))
  })
  await expect.poll(sheetBottom).toBeCloseTo(screenBottom, 0)
})

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
  await page.getByRole('button', { name: '快速新增任務', exact: true }).tap()
  await page
    .getByRole('textbox', { name: '快速新增任務名稱' })
    .fill('Buy tomatoes')
  await page.getByRole('button', { name: '新增這一列', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    '目前無法連線同步，請再試一次。',
  )
  await page.reload()
  await expect(
    page.getByRole('checkbox', { name: '完成任務：Buy tomatoes' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '快速新增任務', exact: true }).tap()
  await expect(
    page.getByRole('textbox', { name: '快速新增任務名稱' }),
  ).toHaveValue('')
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
  await page
    .getByRole('checkbox', { name: `完成任務：${firstTask.title}` })
    .click()
  await expect(page.getByRole('alert')).toContainText('任務已被更新')
  await expect(
    page.getByRole('button', { name: '同步', exact: true }),
  ).toHaveAttribute('data-sync-status', 'conflict')
  const checkbox = page.getByRole('checkbox', {
    name: `完成任務：${changedTitle}`,
    exact: true,
  })
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await page.getByRole('button', { name: /^切換 Board：/ }).click()
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  const completed = page.getByRole('button', { name: new RegExp(changedTitle) })
  await expect(completed).toBeVisible()
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
  await expect(completed).toHaveCount(0)
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
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await page.getByRole('button', { name: '編輯 Project：Errands' }).click()
  const name = page.getByLabel('Project 名稱')
  const save = page.getByRole('button', { name: '儲存', exact: true })
  await name.fill('My errands')
  await save.click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Remote errands' }),
  ).toBeVisible()
  await expect(name).toHaveValue('My errands')
  await save.click()
  await expect(
    page.getByRole('button', { name: '編輯 Project：My errands' }),
  ).toBeVisible()
  expect(revisions).toEqual([1, 2])
})
