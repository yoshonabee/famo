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
  const details = page.getByRole('button', { name: '同步詳細資訊' })
  try {
    await page.goto('/')
    await expect(status).toHaveAttribute('data-sync-status', 'syncing')
    await expect(status).toHaveAccessibleDescription('同步中')
    await details.tap()
    await expect(page.getByText('尚未成功同步')).toBeVisible()
    await expect(page.getByText('待同步異動：0 筆')).toBeVisible()
    await details.tap()
    await expect(page.getByText('尚未成功同步')).toBeHidden()
  } finally {
    releasePull()
  }
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
  await expect(status).toHaveAccessibleDescription('已同步')
  await details.tap()
  await expect(page.getByText(/^上次成功同步：/)).toBeVisible()
  await details.tap()

  await context.setOffline(true)
  await expect(status).toHaveAttribute('data-sync-status', 'offline')
  await expect(status).toHaveAccessibleDescription('離線')

  await context.setOffline(false)
  failPull = true
  await status.tap()
  await expect(status).toHaveAttribute('data-sync-status', 'error')
  await expect(status).toHaveAccessibleDescription('同步失敗')

  failPull = false
  await status.tap()
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
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
