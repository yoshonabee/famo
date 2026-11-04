import { expect, test } from '@playwright/test'
import type { Settings } from '../src/lib/api'

test('自訂選項的名稱、顏色、排序、預設與停用在重整後保留', async ({
  page,
  request,
}) => {
  const original: Settings = await (await request.get('/api/settings')).json()
  try {
    await page.goto('/')
    await page
      .getByRole('button', { name: '下拉選項設定', exact: true })
      .click()
    const types = page.getByRole('group', { name: '任務類型', exact: true })
    await types
      .getByRole('button', { name: '新增任務類型選項', exact: true })
      .click()
    const typeRow = types.locator('.option-row').last()
    await typeRow.getByRole('textbox', { name: /選項名稱/ }).fill('研究')
    await typeRow.getByRole('button', { name: '研究配色', exact: true }).click()
    await typeRow.getByLabel('研究顏色', { exact: true }).fill('#663399')
    await typeRow.getByLabel('預設', { exact: true }).check()
    const stages = page.getByRole('group', {
      name: '研究流程階段',
      exact: true,
    })
    await stages
      .locator('.option-row')
      .first()
      .getByRole('textbox', { name: /選項名稱/ })
      .fill('準備研究')
    await stages
      .getByRole('button', { name: '新增研究流程階段選項', exact: true })
      .click()
    const newStage = stages.locator('.option-row').last()
    await newStage.getByRole('textbox', { name: /選項名稱/ }).fill('調查中')
    await newStage
      .getByRole('button', { name: '調查中配色', exact: true })
      .click()
    await newStage.getByLabel('調查中顏色', { exact: true }).fill('#336699')
    await newStage.getByLabel('預設', { exact: true }).check()
    await newStage
      .getByRole('button', { name: '調查中往上移', exact: true })
      .click()
    const priorities = page.getByRole('group', {
      name: '優先順序',
      exact: true,
    })
    await priorities
      .getByRole('button', { name: '新增優先順序選項', exact: true })
      .click()
    const priorityRow = priorities.locator('.option-row').last()
    await priorityRow
      .getByRole('textbox', { name: /選項名稱/ })
      .fill('立即處理')
    await priorityRow
      .getByRole('button', { name: '立即處理配色', exact: true })
      .click()
    await priorityRow
      .getByLabel('立即處理顏色', { exact: true })
      .fill('#cc3300')
    await priorityRow.getByLabel('預設', { exact: true }).check()
    await page
      .getByRole('button', { name: '儲存選項設定', exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText('設定已儲存。')
    await page.getByRole('button', { name: '任務列表', exact: false }).click()
    const capture = page.getByRole('textbox', { name: '快速新增任務名稱' })
    await capture.fill('使用自訂預設值')
    await capture.press('Enter')
    await expect
      .poll(async () => {
        const list = await (await request.get('/api/tasks')).json()
        return list.find((t: { title: string }) => t.title === '使用自訂預設值')
          ?.stage
      })
      .not.toBeUndefined()
    const list = await (await request.get('/api/tasks')).json()
    const task = list.find(
      (t: { title: string }) => t.title === '使用自訂預設值',
    )
    const saved: Settings = await (await request.get('/api/settings')).json()
    const workflow = saved.workflows.find((w) => w.name === '研究')!
    expect(task.type).toBe(workflow.id)
    expect(task.priority).toBe(saved.default_priority)
    await expect(
      page
        .locator(`[data-task-id="${task.id}"]`)
        .getByText('調查中', { exact: true }),
    ).toHaveCSS('background-color', 'rgb(51, 102, 153)')
    await page.reload()
    await page
      .getByRole('button', { name: '下拉選項設定', exact: true })
      .click()
    const firstStage = stages.locator('.option-row').first()
    await expect(
      firstStage.getByRole('textbox', { name: /選項名稱/ }),
    ).toHaveValue('調查中')
    await firstStage.getByRole('textbox', { name: /選項名稱/ }).fill('深入調查')
    await firstStage.getByLabel('停用', { exact: true }).check()
    await stages
      .locator('.option-row')
      .last()
      .getByLabel('預設', { exact: true })
      .check()
    await page
      .getByRole('button', { name: '儲存選項設定', exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText('設定已儲存。')
    await page.getByRole('button', { name: '任務列表', exact: false }).click()
    await page
      .getByRole('button', { name: '任務詳情：使用自訂預設值', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('流程階段')).toHaveValue(task.stage)
    await expect(
      dialog.getByLabel('流程階段').locator('option:checked'),
    ).toHaveText('深入調查（已停用）')
    await dialog.getByRole('button', { name: '編輯描述', exact: true }).click()
    await dialog
      .getByRole('textbox', { name: '描述', exact: true })
      .fill('停用階段仍可修改描述')
    await dialog
      .getByRole('textbox', { name: '描述', exact: true })
      .press('Control+Enter')
    await expect(
      dialog.getByRole('button', { name: '編輯描述', exact: true }),
    ).toHaveText('停用階段仍可修改描述')
    await dialog.getByRole('button', { name: '關閉', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .getByRole('button', { name: '下拉選項設定', exact: true })
      .click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  } finally {
    const latest: Settings = await (await request.get('/api/settings')).json()
    latest.default_type = original.default_type
    latest.default_priority = original.default_priority
    for (const w of latest.workflows)
      if (!original.workflows.some((o) => o.id === w.id)) w.disabled = true
    for (const p of latest.priorities)
      if (!original.priorities.some((o) => o.id === p.id)) p.disabled = true
    expect(
      (await request.post('/api/settings', { data: latest })).status(),
    ).toBe(200)
  }
})

test('設定儲存失敗與版本衝突都保留草稿', async ({ page, request }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '下拉選項設定', exact: true }).click()
  const general = page.getByRole('group', { name: '一般流程階段', exact: true })
  const stageName = general.getByRole('textbox', { name: /選項名稱/ }).first()
  await stageName.fill('保留設定草稿')
  let attempt = 0
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    if (++attempt === 1)
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: '暫時無法儲存設定' }),
      })
    await route.continue()
  })
  await page.getByRole('button', { name: '儲存選項設定', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('暫時無法儲存設定')
  await expect(stageName).toHaveValue('保留設定草稿')
  const latest: Settings = await (await request.get('/api/settings')).json()
  expect((await request.post('/api/settings', { data: latest })).status()).toBe(
    200,
  )
  await page.getByRole('button', { name: '儲存選項設定', exact: true }).click()
  await expect(
    page.getByText('設定已有更新，草稿仍保留。', { exact: false }),
  ).toBeVisible()
  await expect(stageName).toHaveValue('保留設定草稿')
  await expect(
    page.getByRole('button', { name: '儲存選項設定', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '重新載入設定', exact: true }).click()
  await expect(stageName).toHaveValue('待開始')
})

test('柔和色票、自動配色、自訂色、刪除與放大的詳細頁選單', async ({
  page,
  request,
}) => {
  const original: Settings = await (await request.get('/api/settings')).json()
  try {
    await page.goto('/')
    await page
      .getByRole('button', { name: '下拉選項設定', exact: true })
      .click()
    const priorities = page.getByRole('group', {
      name: '優先順序',
      exact: true,
    })
    await priorities
      .getByRole('button', { name: '新增優先順序選項', exact: true })
      .click()
    const first = priorities.locator('.option-row').last()
    await first.getByRole('textbox', { name: /選項名稱/ }).fill('奶油優先')
    const firstColor = await first.locator('input[type=color]').inputValue()
    expect(original.color_presets.map((p) => p.color.toLowerCase())).toContain(
      firstColor,
    )
    await priorities
      .getByRole('button', { name: '新增優先順序選項', exact: true })
      .click()
    const second = priorities.locator('.option-row').last()
    expect(await second.locator('input[type=color]').inputValue()).not.toBe(
      firstColor,
    )
    await second
      .getByRole('button', { name: '刪除新選項', exact: true })
      .click()
    const colorTrigger = first.getByRole('button', {
      name: '奶油優先配色',
      exact: true,
    })
    await expect(colorTrigger).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await colorTrigger.click()
    await expect(first.getByRole('dialog')).toBeVisible()
    await expect(first.getByRole('button', { name: /奶油優先：/ })).toHaveCount(
      16,
    )
    await page.keyboard.press('Escape')
    await expect(colorTrigger).toHaveAttribute('aria-expanded', 'false')
    await colorTrigger.click()
    await page
      .getByRole('heading', { name: '下拉選項設定', exact: true })
      .click()
    await expect(colorTrigger).toHaveAttribute('aria-expanded', 'false')
    await colorTrigger.click()
    await first
      .getByRole('button', { name: '奶油優先：薰衣草', exact: true })
      .click()
    await expect(first.locator('input[type=color]')).toHaveValue('#cfc1f0')
    await expect(colorTrigger).toHaveAttribute('aria-expanded', 'false')
    await colorTrigger.click()
    await expect(
      first.getByRole('button', { name: '奶油優先：薰衣草', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await first.getByLabel('奶油優先顏色', { exact: true }).fill('#13579b')
    await expect(first.locator('.color-swatch[aria-pressed=true]')).toHaveCount(
      0,
    )
    await first
      .getByRole('button', { name: '奶油優先：奶油餅乾', exact: true })
      .click()
    await first.getByLabel('預設', { exact: true }).check()
    const types = page.getByRole('group', { name: '任務類型', exact: true })
    await types
      .getByRole('button', { name: '新增任務類型選項', exact: true })
      .click()
    const typeRow = types.locator('.option-row').last()
    await typeRow.getByRole('textbox', { name: /選項名稱/ }).fill('可刪除類型')
    await typeRow.getByLabel('預設', { exact: true }).check()
    const stages = page.getByRole('group', {
      name: '可刪除類型流程階段',
      exact: true,
    })
    await stages
      .getByRole('button', { name: '新增可刪除類型流程階段選項', exact: true })
      .click()
    await stages
      .locator('.option-row')
      .last()
      .getByRole('textbox', { name: /選項名稱/ })
      .fill('備選階段')
    await page
      .getByRole('button', { name: '儲存選項設定', exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText('設定已儲存。')
    await page.getByRole('button', { name: '任務列表', exact: false }).click()
    const capture = page.getByRole('textbox', { name: '快速新增任務名稱' })
    await capture.fill('顏色與刪除驗收')
    await capture.press('Enter')
    await page
      .getByRole('button', { name: '任務詳情：顏色與刪除驗收', exact: true })
      .click()
    const dialog = page.getByRole('dialog')
    const stageSelect = dialog.getByLabel('流程階段')
    expect((await stageSelect.boundingBox())!.height).toBeGreaterThanOrEqual(46)
    expect(
      await stageSelect.evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      ),
    ).toBeGreaterThanOrEqual(15)
    await expect(dialog.getByLabel('優先順序')).toHaveCSS(
      'background-color',
      'rgb(245, 223, 160)',
    )
    await page.screenshot({ path: '/private/tmp/famo-option-detail.png' })
    await dialog.getByRole('button', { name: '關閉', exact: true }).click()
    const tasks = await (await request.get('/api/tasks')).json()
    const task = tasks.find(
      (t: { title: string }) => t.title === '顏色與刪除驗收',
    )
    await page
      .getByRole('button', { name: '下拉選項設定', exact: true })
      .click()
    await stages
      .getByRole('button', { name: '刪除待開始', exact: true })
      .click()
    await expect(stages.getByLabel('預設', { exact: true })).toBeChecked()
    await page
      .getByRole('button', { name: '儲存選項設定', exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText('設定已儲存。')
    const stageChanged = await (
      await request.get(`/api/tasks/${task.id}`)
    ).json()
    expect(stageChanged.stage).not.toBe(task.stage)
    expect(stageChanged.version).toBe(task.version + 1)
    await types
      .getByRole('button', { name: '刪除可刪除類型', exact: true })
      .click()
    await priorities
      .getByRole('button', { name: '刪除奶油優先', exact: true })
      .click()
    await page
      .getByRole('button', { name: '儲存選項設定', exact: true })
      .click()
    await expect(page.getByRole('status')).toHaveText('設定已儲存。')
    await page.reload()
    const saved: Settings = await (await request.get('/api/settings')).json()
    expect(saved.workflows.some((w) => w.id === task.type)).toBe(false)
    expect(saved.priorities.some((p) => p.id === String(task.priority))).toBe(
      false,
    )
    const moved = await (await request.get(`/api/tasks/${task.id}`)).json()
    expect(moved.type).toBe(saved.default_type)
    expect(moved.priority).toBe(saved.default_priority)
    expect(moved.version).toBe(task.version + 2)
    expect(moved.history.at(-1).action).toBe('replace_deleted_option')
    await page.setViewportSize({ width: 390, height: 844 })
    await page
      .getByRole('button', { name: '下拉選項設定', exact: true })
      .click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: '/private/tmp/famo-option-settings-mobile.png',
      fullPage: true,
    })
    const mobileRow = page
      .getByRole('group', { name: '任務類型', exact: true })
      .locator('.option-row')
      .first()
    await mobileRow.getByRole('button', { name: /配色$/ }).click()
    const mobilePanel = mobileRow.getByRole('dialog')
    await expect(mobilePanel).toBeVisible()
    const box = (await mobilePanel.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await page.screenshot({ path: '/private/tmp/famo-color-menu-mobile.png' })
  } finally {
    const latest: Settings = await (await request.get('/api/settings')).json()
    latest.default_type = original.default_type
    latest.default_priority = original.default_priority
    expect(
      (await request.post('/api/settings', { data: latest })).status(),
    ).toBe(200)
  }
})
