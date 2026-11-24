import { expect, test, type WebSocketRoute } from '@playwright/test'

test('push refreshes the page data and version responses show the appropriate reload UI', async ({
  page,
}, testInfo) => {
  let send: WebSocketRoute['send'] | undefined
  let pulls = 0
  let update: 'none' | 'optional' | 'required' = 'none'
  await page.routeWebSocket('**/api/sync/events?protocol=1', (socket) => {
    send = (message) => socket.send(message)
  })
  await page.route('**/api/sync/collections', (route) =>
    route.fulfill({ json: { version: 0, projects: [], boards: [] } }),
  )
  await page.route('**/api/sync/pull?*', (route) => {
    pulls++
    expect(route.request().headers()['x-famo-web-protocol']).toBe('1')
    if (update === 'required')
      return route.fulfill({
        status: 412,
        headers: { 'X-Famo-Web-Min-Protocol': '2' },
        json: { error: 'Reload Famo to continue syncing' },
      })
    return route.fulfill({
      headers:
        update === 'optional' ? { 'X-Famo-Web-Build': 'a'.repeat(64) } : {},
      json: { changes: [], cursor: 0, has_more: false },
    })
  })

  await page.goto('/')
  await expect.poll(() => Boolean(send)).toBe(true)
  await expect(
    page.getByRole('button', { name: '同步', exact: true }),
  ).toHaveAttribute('data-sync-status', 'synced')
  const initialPulls = pulls
  update = 'optional'
  send?.(JSON.stringify({ type: 'tasks', sequence: 1 }))
  await expect(
    page.getByRole('status').filter({ hasText: 'Famo 有新版' }),
  ).toBeVisible()
  expect(pulls).toBeGreaterThan(initialPulls)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('web-update-available.png'),
  })

  update = 'required'
  send?.(JSON.stringify({ type: 'tasks', sequence: 2 }))
  const dialog = page.getByRole('dialog', { name: '請重新整理 Famo' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('web-update-required.png'),
  })

  update = 'none'
  await dialog.getByRole('button', { name: '重新整理' }).click()
  await expect(dialog).toHaveCount(0)
})
