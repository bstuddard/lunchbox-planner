import { expect, test } from '@playwright/test'
import { applyImport, button, chooseJSON, exampleBackup, nav, saved } from './interaction-helpers'

test('a restored older catalog can stock and pack a Fruit Pouch', async ({ page }) => {
  const backup = exampleBackup()
  const oldState = { ...backup.data.appState, stateVersion: 1,
    categories: backup.data.appState.categories.filter(c => c.id !== 'cat-fruit-pouch') }
  await page.clock.setFixedTime(new Date(2026, 10, 23, 12))
  await page.goto('./#setup')
  await button(page, 'Data').click()
  await chooseJSON(page, 'Full backup', { ...backup, data: { ...backup.data, appState: oldState } })
  await applyImport(page, 'Replace all data')
  await nav(page, 'Inventory')
  await button(page, 'Quick add food').click()
  await page.getByLabel('Food name').fill('Pear pouch')
  await page.getByRole('checkbox', { name: 'Fruit Pouch', exact: true }).check()
  await button(page, 'Save food').click()
  await nav(page, 'Setup')
  await button(page, 'Schedules').click()
  await button(page, 'Edit Morning snack').click()
  await page.getByLabel('Required category').selectOption({ label: 'Fruit Pouch' })
  await button(page, 'Save meal').click()
  await nav(page, 'Week')
  await button(page, 'Generate week').click()
  await button(page, 'Generate plan').click()
  await expect(page.locator('.prep').filter({ hasText: 'Fruit Pouch' })).toContainText('Pear pouch')
  await saved(page)
  await page.reload()
  await nav(page, 'Today')
  await expect(page.getByRole('checkbox', { name: 'Pear pouch' })).toHaveCount(1)
})
