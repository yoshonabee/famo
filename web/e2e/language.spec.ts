import { expect, test, type Page } from '@playwright/test'

async function showLanguageSettings(page: Page) {
  await page.getByRole('button', { name: /^(設定|Settings)$/ }).click()
  await page.getByRole('button', { name: /^(一般|General)$/ }).click()
  return page.getByRole('combobox', { name: /^(顯示語言|Display language)$/ })
}

test.use({ timezoneId: 'Asia/Taipei' })

test('switches language immediately across the main and menu bar windows and saves the choice', async ({
  page,
  context,
  request,
}) => {
  const panel = await context.newPage()
  await panel.setViewportSize({ width: 360, height: 480 })
  const time = new Date('2047-06-12T03:00:00Z')
  await page.clock.setFixedTime(time)
  await panel.clock.setFixedTime(time)
  await panel.addInitScript(() =>
    localStorage.setItem('famo.menu-bar.board', ''),
  )
  const taskName = '保留原文的任務'
  const created = await request.post('/api/tasks', {
    data: { title: taskName, scheduled_date: '2047-06-12' },
  })
  expect(created.ok()).toBe(true)

  await page.goto('/')
  await panel.goto('/menu-bar.html')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(panel.getByRole('heading', { name: '今日任務' })).toBeVisible()

  const language = await showLanguageSettings(page)
  await expect(language).toHaveValue('system')
  await language.selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveTitle('Famo · Personal task workspace')
  await expect(language).toHaveValue('en')
  await expect(
    page.getByRole('button', { name: 'General', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Agents', exact: true }),
  ).toBeVisible()
  await expect(panel).toHaveTitle("Famo · Today's tasks")
  await expect(panel.locator('html')).toHaveAttribute('lang', 'en')
  await expect(
    panel.getByRole('heading', { name: "Today's tasks" }),
  ).toBeVisible()
  await expect(
    panel.getByRole('checkbox', { name: `Complete task: ${taskName}` }),
  ).toBeVisible()

  await page.reload()
  await expect(page.locator('h1 time')).toHaveText('June 12, 2047')
  await page.getByRole('button', { name: 'Open calendar' }).click()
  const calendar = page.getByRole('dialog', { name: 'Choose a date' })
  await expect(
    calendar.getByRole('button', { name: 'June 2047' }),
  ).toBeVisible()
  await calendar.getByRole('button', { name: 'June 2047' }).click()
  await expect(
    calendar
      .getByRole('group', { name: 'Months' })
      .getByRole('button', { name: 'Jun', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  const savedLanguage = await showLanguageSettings(page)
  await expect(savedLanguage).toHaveValue('en')
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await expect(
    page.getByRole('radio', { name: 'Moss', exact: true }),
  ).toBeChecked()
  await page.screenshot({
    path: '/private/tmp/famo-language-settings-en.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: 'General', exact: true }).click()
  await savedLanguage.selectOption('zh-TW')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(
    page.getByRole('button', { name: '一般', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Agents', exact: true }),
  ).toBeVisible()
  await expect(panel.getByRole('heading', { name: '今日任務' })).toBeVisible()
  await expect(
    panel.getByRole('checkbox', { name: `完成任務：${taskName}` }),
  ).toBeVisible()
})

test('follows preferred languages in order until an explicit choice is made', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['ja-JP', 'en-GB', 'zh-Hant-TW'],
    })
  })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const language = await showLanguageSettings(page)
  await expect(language).toHaveValue('system')
  await expect(
    language.getByRole('option', { name: 'Follow system' }),
  ).toBeAttached()

  async function changeSystemLanguages(languages: string[]) {
    await page.evaluate((value) => {
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        value,
      })
      window.dispatchEvent(new Event('languagechange'))
    }, languages)
  }

  await changeSystemLanguages(['zh-Hant-HK', 'en-GB'])
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await language.selectOption('zh-TW')
  await changeSystemLanguages(['en-US'])
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')

  await page.reload()
  const savedLanguage = await showLanguageSettings(page)
  await expect(savedLanguage).toHaveValue('zh-TW')
  await savedLanguage.selectOption('system')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await changeSystemLanguages(['ja-JP'])
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(await showLanguageSettings(page)).toHaveValue('system')
})

test('a language change in another tab translates a visible validation error and keeps the form draft', async ({
  page,
  context,
}) => {
  const settings = await context.newPage()
  await settings.goto('/')
  const language = await showLanguageSettings(settings)
  await language.selectOption('en')
  await page.goto('/')
  await page.getByRole('button', { name: 'Add Project', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Project' })
  await dialog
    .getByRole('textbox', { name: 'Project name' })
    .fill('原始 Project 名稱')
  await dialog.getByText('Agent workspace', { exact: true }).click()
  await dialog
    .getByRole('textbox', { name: 'Workspace path' })
    .fill('relative/path')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText(
    'Invalid input: Enter an absolute workspace path',
  )

  await language.selectOption('zh-TW')
  const translated = page.getByRole('dialog', { name: '新增 Project' })
  await expect(translated.getByRole('alert')).toHaveText(
    '無效的輸入：工作區請使用完整路徑',
  )
  await expect(
    translated.getByRole('textbox', { name: 'Project 名稱' }),
  ).toHaveValue('原始 Project 名稱')
  await expect(
    translated.getByRole('textbox', { name: '工作區路徑' }),
  ).toHaveValue('relative/path')
})
