import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('可以儲存 Agent 工作區與選填指引並取得安裝指令', async ({
  page,
  request,
}) => {
  const dir = await mkdtemp(join(tmpdir(), 'famo-workspace-'))
  const previous = await (await request.get('/api/agent/workspace')).json()
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await page.getByRole('button', { name: '設定' }).click()
    await page
      .getByRole('navigation', { name: '設定分類' })
      .getByRole('button', { name: 'Agents', exact: true })
      .click()

    const settings = page.getByRole('region', { name: 'Agents' })
    await expect(
      settings.getByRole('button', { name: '複製 CLI 安裝指令' }),
    ).toBeVisible()
    await settings.getByRole('button', { name: '複製 Skill 安裝指令' }).click()
    await expect(settings.getByText('已複製指令')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      './bin/famo-agent skill install',
    )

    const workspace = settings.getByLabel('工作區路徑')
    const prompt = settings.getByLabel('工作區指引（選填）')
    const save = settings.getByRole('button', { name: '儲存工作區' })
    await workspace.fill('relative/path')
    await save.click()
    await expect(settings.getByRole('alert')).toContainText('完整路徑')
    await expect(workspace).toHaveValue('relative/path')

    await workspace.fill(dir)
    await prompt.fill('先看 docs/，再跑測試。')
    await save.click()
    await expect(settings.getByText('工作區已儲存')).toBeVisible()

    await page.reload()
    await page.getByRole('button', { name: '設定' }).click()
    await page
      .getByRole('navigation', { name: '設定分類' })
      .getByRole('button', { name: 'Agents', exact: true })
      .click()
    await expect(workspace).toHaveValue(dir)
    await expect(prompt).toHaveValue('先看 docs/，再跑測試。')
    await prompt.clear()
    await save.click()
    await expect(settings.getByText('工作區已儲存')).toBeVisible()
    await expect(save).toBeDisabled()
    const saved = await (await request.get('/api/agent/workspace')).json()
    expect(saved).toEqual({ dir, prompt: '' })
  } finally {
    await request.post('/api/agent/workspace', { data: previous })
    await rm(dir, { recursive: true, force: true })
  }
})
