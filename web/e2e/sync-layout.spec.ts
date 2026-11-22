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
  links: [{ url: 'https://example.com/library' }],
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

test('switches Boards, browses Projects and searches without exposing mobile URL or theme controls', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('famo.theme', 'midnight'))
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({
      json: {
        ...collections,
        boards: [
          board,
          { id: 'board-2', name: 'Work', icon: 'briefcase', project_ids: [] },
        ],
      },
    }),
  )
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: '主要導覽' })
  await expect(navigation).toBeVisible()
  const navBounds = (await navigation.boundingBox())!
  const captureBounds = (await page
    .getByRole('button', { name: '快速新增任務' })
    .boundingBox())!
  expect(navBounds.y + navBounds.height).toBeCloseTo(
    page.viewportSize()!.height,
    0,
  )
  expect(captureBounds.y + captureBounds.height).toBeLessThan(navBounds.y)
  await page.getByRole('button', { name: '切換 Board：Home' }).tap()
  await page.getByRole('button', { name: 'Work', exact: true }).tap()
  await expect(
    page.getByRole('button', { name: '切換 Board：Work' }),
  ).toBeVisible()

  await navigation.getByRole('button', { name: 'Projects', exact: true }).tap()
  await page.getByRole('button', { name: project.name, exact: true }).tap()
  await expect(page.getByRole('heading', { name: project.name })).toBeVisible()
  await expect(page.getByRole('link')).toHaveCount(0)

  await navigation.getByRole('button', { name: 'Boards', exact: true }).tap()
  await expect(
    page.getByRole('button', { name: '切換 Board：Work' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '外觀', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'moss')

  await navigation.getByRole('button', { name: '搜尋所有任務' }).tap()
  const search = page.getByRole('dialog', { name: '搜尋所有任務' })
  await search.getByRole('textbox', { name: '搜尋任務' }).fill('opening hours')
  await search.getByRole('button', { name: task.title }).tap()
  await expect(page.getByRole('dialog')).toContainText(task.description)
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '相關連結' })).toHaveCount(0)

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
  await page.getByRole('button', { name: '切換 Board：Home' }).tap()
  await page.getByRole('button', { name: '編輯 Board：Home' }).tap()
  const editor = page.getByRole('dialog', { name: '編輯 Board' })
  const name = editor.getByRole('textbox', { name: 'Board 名稱' })
  const save = editor.getByRole('button', { name: '儲存', exact: true })
  await name.fill('Local draft')
  await editor.getByRole('button', { name: /^Board 圖示/ }).tap()
  await editor.getByRole('option', { name: '公事包', exact: true }).tap()
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
    page.getByRole('button', { name: '切換 Board：Local draft' }),
  ).toBeVisible()
  expect(versions).toEqual([1, 2])
  expect(current.boards[0].icon).toBe('briefcase')
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
  await page.getByRole('button', { name: 'Projects', exact: true }).tap()
  await page.getByRole('button', { name: '編輯 Project：Personal' }).tap()
  const editor = page.getByRole('dialog', { name: '編輯 Project' })
  const name = editor.getByRole('textbox', { name: 'Project 名稱' })
  await name.fill('Personal draft')
  await editor.getByRole('radio', { name: '海藍', exact: true }).check()

  current = {
    ...collections,
    version: 2,
    projects: [{ ...project, name: 'Remote Personal' }],
  }
  await page.clock.fastForward(11_000)
  await expect(page.getByText('Remote Personal', { exact: true })).toHaveCount(
    1,
  )

  const save = editor.getByRole('button', { name: '儲存', exact: true })
  await save.tap()
  await expect(editor.getByRole('alert')).toContainText('Remote Personal')
  await expect(name).toHaveValue('Personal draft')
  expect(versions).toEqual([])

  await save.tap()
  await expect(editor).toBeHidden()
  expect(versions).toEqual([2])
  expect(current.projects[0].color).toBe('#4F87CC')
})

test('opens the same quick capture from the floating button and retains the Board date and Project between tasks', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2024, 5, 6, 12))
  const extra = {
    id: 'project-2',
    name: 'Errands',
    color: '#527844',
    position: 1,
  }
  const outside = {
    id: 'project-3',
    name: 'Work',
    color: '#4F87CC',
    position: 2,
  }
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({
      json: {
        ...collections,
        projects: [project, extra, outside],
        boards: [{ ...board, project_ids: [project.id, extra.id] }],
      },
    }),
  )
  const saved: Task[] = []
  await page.route('**/api/sync/push', (route) => {
    const task: Task = route.request().postDataJSON().task
    saved.push(task)
    return route.fulfill({
      json: { change: { sequence: saved.length + 1, task } },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '切換 Board：Home' }).tap()
  await page.getByRole('button', { name: 'Home', exact: true }).tap()
  await page.getByRole('button', { name: '快速新增任務', exact: true }).tap()
  const capture = page.getByRole('dialog', { name: '快速新增任務' })
  const title = capture.getByRole('textbox', { name: '快速新增任務名稱' })
  const add = capture.getByRole('button', { name: '新增這一列' })
  const chooseProject = capture.getByRole('button', { name: '任務 Project' })
  await expect(title).toBeFocused()
  await title.fill('Return library book')
  await expect(add).toBeDisabled()
  await chooseProject.tap()
  await expect(capture.getByRole('option', { name: outside.name })).toHaveCount(
    0,
  )
  await capture.getByRole('option', { name: extra.name }).tap()
  await capture.getByRole('button', { name: /^任務日期/ }).tap()
  await capture.locator('[data-date="2024-06-07"]').tap()
  await title.press('Enter')
  await expect(title).toHaveValue('')
  await expect(title).toBeFocused()
  await expect(chooseProject).toContainText(extra.name)
  await title.fill('Pick up groceries')
  await add.tap()
  await expect(title).toHaveValue('')
  await expect.poll(() => saved.length).toBe(2)
  expect(
    saved.map(({ title, project_id, scheduled_date }) => [
      title,
      project_id,
      scheduled_date,
    ]),
  ).toEqual([
    ['Return library book', extra.id, '2024-06-07'],
    ['Pick up groceries', extra.id, '2024-06-07'],
  ])
})
