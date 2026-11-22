import { expect, test } from '@playwright/test'

test('reports initial sync, disconnection, failure, and manual recovery', async ({
  context,
  page,
}) => {
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
  try {
    await page.goto('/')
    await expect(status).toHaveAttribute('data-sync-status', 'syncing')
    await expect(status).toHaveAccessibleDescription('同步中')
  } finally {
    releasePull()
  }
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
  await expect(status).toHaveAccessibleDescription('已同步')

  await context.setOffline(true)
  await expect(status).toHaveAttribute('data-sync-status', 'offline')
  await expect(status).toHaveAccessibleDescription('等待連線')

  await context.setOffline(false)
  failPull = true
  await status.tap()
  await expect(status).toHaveAttribute('data-sync-status', 'error')
  await expect(status).toHaveAccessibleDescription('同步失敗')

  failPull = false
  await status.tap()
  await expect(status).toHaveAttribute('data-sync-status', 'synced')
})
