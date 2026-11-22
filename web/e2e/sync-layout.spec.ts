import { expect, test } from '@playwright/test'
import type { Task } from '../src/lib/api'
import type { Collections } from '../src/lib/cloud-transport'

const project = {
  id: 'project-1',
  name: 'Personal',
  color: '#64748B',
  position: 0,
}
const board = {
  id: 'board-1',
  name: 'Home',
  icon: 'layout-grid',
  project_ids: [project.id],
}
const collections: Collections = {
  version: 1,
  projects: [project],
  boards: [board],
}
const task: Task = {
  id: '01aac6e693d122b17b21ede6c425cce7',
  title: 'Call the library',
  scheduled_date: '2024-06-06',
  project_id: project.id,
  description: 'Ask about opening hours',
  links: [],
  created_at: '2024-06-06T12:00:00Z',
  updated_at: '2024-06-06T12:00:00Z',
  completed_at: null,
  deleted_at: null,
  version: 1,
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/sync/pull?*', (route) => {
    const after = Number(
      new URL(route.request().url()).searchParams.get('after'),
    )
    return route.fulfill({
      json: {
        changes: after === 0 ? [{ sequence: 1, task }] : [],
        cursor: 1,
        has_more: false,
      },
    })
  })
})

test('opens the compact navigation, selects a Project and searches across views', async ({
  page,
}) => {
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: collections }),
  )
  await page.goto('/')

  const navigation = page.getByRole('navigation', { name: '主要導覽' })
  const openMenu = page.getByRole('button', { name: '展開側邊欄' })
  await expect(navigation).toBeHidden()
  await openMenu.tap()
  await expect(navigation).toBeVisible()
  await page.getByRole('button', { name: project.name, exact: true }).tap()
  await expect(page.getByRole('heading', { name: project.name })).toBeVisible()
  await expect(navigation).toBeHidden()
  await expect(openMenu).toBeFocused()

  await openMenu.tap()
  await page.getByRole('button', { name: '設定', exact: true }).tap()
  await expect(
    page.getByRole('heading', { name: '設定', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agents' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '本機資料' })).toHaveCount(0)

  await page.getByRole('button', { name: '搜尋所有任務' }).tap()
  const search = page.getByRole('dialog', { name: '搜尋所有任務' })
  await search.getByRole('textbox', { name: '搜尋任務' }).fill('opening hours')
  await search.getByRole('button', { name: task.title }).tap()
  await expect(page.getByRole('dialog')).toContainText(task.description)

  const sizes = await page.evaluate(() => ({
    contentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(sizes.contentWidth).toBe(sizes.viewportWidth)
})

test('retains a Board draft while the user reviews updated settings', async ({
  page,
}) => {
  const remote: Collections = {
    ...collections,
    version: 2,
    boards: [{ ...board, name: 'Remote Home' }],
  }
  let current = collections
  const versions: number[] = []
  await page.route('**/api/sync/collections', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: current })
    const input = route.request().postDataJSON()
    versions.push(input.base_version)
    if (versions.length === 1) {
      current = remote
      return route.fulfill({ status: 409, json: { current } })
    }
    current = { version: 3, projects: input.projects, boards: input.boards }
    return route.fulfill({ json: current })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '展開側邊欄' }).tap()
  await page.getByRole('button', { name: '編輯 Board：Home' }).tap()
  const editor = page.getByRole('dialog', { name: '編輯 Board' })
  const name = editor.getByRole('textbox', { name: 'Board 名稱' })
  const save = editor.getByRole('button', { name: '儲存', exact: true })
  await name.fill('Local draft')
  await save.tap()
  await expect(editor.getByRole('alert')).toContainText('同步時 Board 已更新')
  await expect(
    editor.getByText('最新名稱為「Remote Home」', { exact: false }),
  ).toBeVisible()
  await expect(save).toBeDisabled()
  await editor.getByRole('button', { name: '保留草稿' }).tap()
  await expect(name).toHaveValue('Local draft')
  await save.tap()
  await expect(editor).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Local draft', exact: true }),
  ).toBeVisible()
  expect(versions).toEqual([1, 2])
})

test('requires another Project save after data refreshes while the editor is open', async ({
  page,
}) => {
  await page.clock.install()
  let current = collections
  const versions: number[] = []
  await page.route('**/api/sync/collections', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: current })
    const input = route.request().postDataJSON()
    versions.push(input.base_version)
    current = { version: 3, projects: input.projects, boards: input.boards }
    return route.fulfill({ json: current })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '展開側邊欄' }).tap()
  await page.getByRole('button', { name: '編輯 Project：Personal' }).tap()
  const editor = page.getByRole('dialog', { name: '編輯 Project' })
  const name = editor.getByRole('textbox', { name: 'Project 名稱' })
  await name.fill('Personal draft')

  current = {
    ...collections,
    version: 2,
    projects: [{ ...project, name: 'Remote Personal' }],
  }
  await page.clock.fastForward(11_000)
  await expect(
    page.locator('#app-sidebar').getByTitle('Remote Personal', { exact: true }),
  ).toHaveCount(1)

  const save = editor.getByRole('button', { name: '儲存', exact: true })
  await save.tap()
  await expect(editor.getByRole('alert')).toContainText('Remote Personal')
  await expect(name).toHaveValue('Personal draft')
  expect(versions).toEqual([])

  await save.tap()
  await expect(editor).toBeHidden()
  expect(versions).toEqual([2])
})
