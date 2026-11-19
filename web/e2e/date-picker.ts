import { type Locator, type Page } from '@playwright/test'

export async function selectCalendarDate(scope: Page | Locator, date: string) {
  const calendar = scope.getByRole('dialog', { name: '選擇日期', exact: true })
  const day = calendar.getByRole('button', { name: date, exact: true })
  const [year, month] = date.split('-').map(Number)
  if (!(await day.count())) {
    const heading = calendar.locator('.calendar-view-button')
    await heading.click()
    if ((await heading.textContent())?.trim() !== `${year} 年`) {
      await heading.click()
      await calendar
        .getByRole('group', { name: '年份' })
        .getByRole('button', { name: `${year} 年`, exact: true })
        .click()
    }
    await calendar
      .getByRole('group', { name: '月份' })
      .getByRole('button', { name: `${month} 月`, exact: true })
      .click()
  }
  await day.click()
}

export async function setTaskDate(detail: Locator, date: string) {
  await detail.getByRole('button', { name: /^任務日期：/ }).click()
  await selectCalendarDate(detail, date)
}
