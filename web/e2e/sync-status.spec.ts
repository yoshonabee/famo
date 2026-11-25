import { expect, test } from '@playwright/test'

test('reports initial sync, disconnection, failure, and manual recovery', async ({
  context,
  page,
}) => {
  await page.clock.install()
  let failPull = false
  let releasePull: () => void = () => {}
  const firstPull = new Promise<void>((resolve) => {
    releasePull = resolve
  })
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: { version: 0, projects: [], boards: [] } }),
  )
  await page.route('**/api/sync/pull?*', async (route) => {
    await firstPull
    if (failPull)
      return route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    return route.fulfill({
      json: { changes: [], cursor: 0, has_more: false },
    })
  })

  const status = page.getByRole('button', { name: '同步', exact: true })
  const details = page.getByRole('tooltip')
  try {
    await page.goto('/')
    await expect(status).toHaveAttribute('data-sync-status', 'syncing')
    await expect(status).toHaveAccessibleDescription('同步中')
    await expect(details).toBeHidden()
    await expect(status).toHaveText('')
    await status.hover()
    await expect(details).toContainText('同步中')
    await expect(details).toContainText('尚未成功同步')
    await expect(
      details.getByText('待同步異動：0', { exact: true }),
    ).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(details).toBeHidden()
  } finally {
    releasePull()
  }
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
  await expect(status).toHaveAccessibleDescription('已同步')
  await status.hover()
  await expect(page.getByText('上次同步：剛剛')).toBeVisible()
  await page.mouse.move(0, 0)

  await context.setOffline(true)
  await expect(status).toHaveAttribute('data-sync-status', 'offline')
  await expect(status).toHaveAccessibleDescription('離線')
  await page.clock.fastForward(6000)
  await status.hover()
  await expect(details).toContainText(/上次同步：\d+ 秒前/)
  await page.mouse.move(0, 0)

  await context.setOffline(false)
  failPull = true
  await status.tap()
  await expect(status).toHaveAttribute('data-sync-status', 'error')
  await expect(details).toContainText('同步失敗')

  failPull = false
  await status.tap()
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
})

test('keeps the relative time fixed until sync details are reopened', async ({
  context,
  page,
}) => {
  await page.clock.install()
  await page.addInitScript(() => localStorage.setItem('famo.language', 'en'))
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: { version: 0, projects: [], boards: [] } }),
  )
  await page.route('**/api/sync/pull?*', (route) =>
    route.fulfill({ json: { changes: [], cursor: 0, has_more: false } }),
  )
  await page.goto('/')
  const status = page.getByRole('button', { name: 'Sync now' })
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
  await context.setOffline(true)
  await status.hover()
  await expect(page.getByText('Last synced: just now')).toBeVisible()
  await expect(page.getByText('Unsynced changes: 0')).toBeVisible()

  await page.clock.fastForward(6000)
  await expect(page.getByText('Last synced: just now')).toBeVisible()
  await page.mouse.move(0, 0)
  await status.hover()
  await expect(page.getByText('Last synced: 6 seconds ago')).toBeVisible()
  await page.clock.fastForward(54_000)
  await expect(page.getByText('Last synced: 6 seconds ago')).toBeVisible()
  await page.mouse.move(0, 0)
  await status.hover()
  await expect(page.getByText('Last synced: 1 minute ago')).toBeVisible()
  await page.clock.fastForward(3_540_000)
  await page.mouse.move(0, 0)
  await status.hover()
  await expect(page.getByText('Last synced: 1 hour ago')).toBeVisible()
  await page.clock.fastForward(82_800_000)
  await page.mouse.move(0, 0)
  await status.hover()
  await expect(page.getByText('Last synced: 1 day ago')).toBeVisible()
})

test('keeps green during quick syncs and turns yellow during slow ones', async ({
  page,
}) => {
  await page.clock.install()
  let pulls = 0
  let gate = Promise.resolve()
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: { version: 0, projects: [], boards: [] } }),
  )
  await page.route('**/api/sync/pull?*', async (route) => {
    pulls++
    await gate
    return route.fulfill({
      json: { changes: [], cursor: 0, has_more: false },
    })
  })

  const status = page.getByRole('button', { name: '同步', exact: true })
  await page.goto('/')
  await expect(status).toHaveAttribute('data-sync-status', 'synced')

  async function requestSync() {
    const previous = pulls
    let finish = () => {}
    gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    await status.tap()
    await expect.poll(() => pulls).toBeGreaterThan(previous)
    await expect(status).toHaveAttribute('data-sync-status', 'synced')
    return finish
  }

  const finishQuick = await requestSync()
  const quickResponse = page.waitForResponse('**/api/sync/pull?*')
  finishQuick()
  await quickResponse
  await page.clock.runFor(3000)
  await expect(status).toHaveAttribute('data-sync-status', 'synced')

  const finishSlow = await requestSync()
  try {
    await page.clock.runFor(3000)
    await expect(status).toHaveAttribute('data-sync-status', 'syncing')
  } finally {
    finishSlow()
  }
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
})

test('places the sync indicator next to the desktop sidebar brand', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 780 })
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: { version: 0, projects: [], boards: [] } }),
  )
  await page.route('**/api/sync/pull?*', (route) =>
    route.fulfill({ json: { changes: [], cursor: 0, has_more: false } }),
  )
  await page.addInitScript(() =>
    localStorage.setItem('famo.sidebar', JSON.stringify({ width: 144 })),
  )
  await page.goto('/')
  const heading = page.locator('.sidebar-heading')
  const brand = heading.getByRole('link', { name: 'Famo' })
  const status = heading.getByRole('button', { name: '同步', exact: true })
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
  const brandBox = (await brand.boundingBox())!
  const statusBox = (await status.boundingBox())!
  expect(statusBox.x).toBeCloseTo(brandBox.x + brandBox.width, 0)
  const sidebar = (await page.locator('.sidebar').boundingBox())!
  expect(statusBox.x + statusBox.width).toBeLessThan(sidebar.x + sidebar.width)
  expect(statusBox.y + statusBox.height / 2).toBeCloseTo(
    brandBox.y + brandBox.height / 2,
    0,
  )
  await status.hover()
  await expect(heading.getByRole('tooltip')).toContainText('已同步')
})
