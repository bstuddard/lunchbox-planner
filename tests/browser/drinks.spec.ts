import { expect, test } from '@playwright/test'
import { applyImport, button, chooseJSON, downloadJSON, exampleBackup, nav, openPlanner, saved } from './interaction-helpers'
import type { State } from '../../src/domain/model'

for (const first of ['meal', 'food'] as const) {
  test('a catalog without Drink supports opting one child in, starting with the ' + first, async ({ page }) => {
    const backup = exampleBackup()
    const initial = backup.data.appState
    initial.categories = initial.categories.filter(c => c.id !== 'cat-drink')
    await openPlanner(page, backup)
    const include = page.getByRole('checkbox', { name: 'Include a drink' })
    async function configureMeal() {
      await nav(page, 'Setup')
      await button(page, 'Schedules').click()
      await button(page, 'Edit Lunch').click()
      await expect(include).not.toBeChecked()
      await include.check()
      await button(page, 'Save meal').click()
      await expect(page.getByText(/1 × Main.*2 × Snack.*1 × Drink/)).toBeVisible()
    }
    async function addDrink() {
      await nav(page, 'Inventory')
      await button(page, 'Quick add food').click()
      await page.getByLabel('Food name').fill('Oat milk')
      await page.getByRole('checkbox', { name: 'Drink', exact: true }).check()
      await button(page, 'Save food').click()
      await expect(button(page, 'Oat milk availability')).toHaveAttribute('aria-pressed', 'true')
    }
    if (first === 'meal') {
      await configureMeal()
      await addDrink()
    } else {
      await addDrink()
      await configureMeal()
    }
    await nav(page, 'Week')
    await button(page, 'Generate week').click()
    await button(page, 'Generate plan').click()
    await expect(page.locator('.prep').filter({ hasText: 'Drink' })).toContainText('Oat milk')
    await nav(page, 'Today')
    const milk = page.getByRole('checkbox', { name: 'Oat milk' })
    await expect(milk).toHaveCount(1)
    await expect(page.getByRole('article').nth(1)).not.toContainText('Oat milk')
    await milk.check()
    await saved(page)
    await page.reload()
    await expect(milk).toBeChecked()
    await button(page, 'Saved on this device').click()
    const exported = await downloadJSON(page, button(page.getByRole('main'), 'Export full backup'))
    const state: State = exported.data.appState
    expect(state.categories.filter(c => c.name === 'Drink')).toHaveLength(1)
    const slots = state.weeklyPlans[0].days.flatMap(day => day.children.flatMap(child =>
      child.meals.flatMap(meal => meal.slots.filter(s => s.categoryId === 'cat-drink')
        .map(s => [day.date, child.childId, meal.mealId, s.foodNameSnapshot]))))
    expect(slots).toEqual([['2026-11-23', 'child-1', 'lunch', 'Oat milk']])
    await button(page, 'Schedules').click()
    await button(page, 'Edit Lunch').click()
    await expect(include).toBeChecked()
    await include.uncheck()
    await button(page, 'Save meal').click()
    await nav(page, 'Week')
    await button(page, 'Regenerate day for all').click()
    await button(page.getByRole('dialog'), 'Regenerate').click()
    await nav(page, 'Today')
    await expect(milk).toHaveCount(0)
    await button(page, 'Saved on this device').click()
    await chooseJSON(page, 'Full backup', exported)
    await applyImport(page, 'Replace all data')
    await nav(page, 'Today')
    await expect(milk).toBeChecked()
  })
}

test('imported drink categories and quantities survive editing a meal', async ({ page }) => {
  const backup = exampleBackup()
  const state = backup.data.appState
  const drink = state.categories.find(c => c.id === 'cat-drink')!
  drink.id = 'family-beverages'
  drink.name = 'Drinks'
  state.schedules[1].weekdays.Monday[1].requirements.push({ categoryId: drink.id, count: 2 })
  await openPlanner(page, backup)
  await button(page, 'Schedules').click()
  await page.getByRole('combobox', { name: 'Child', exact: true }).selectOption('child-2')
  await button(page, 'Edit Lunch').click()
  await expect(page.getByRole('checkbox', { name: 'Include a drink' })).toBeChecked()
  await page.getByLabel('Meal name').fill('Packed lunch')
  await button(page, 'Save meal').click()
  await expect(page.getByText(/2 × Drinks/)).toBeVisible()
  await nav(page, 'Foods')
  await button(page, 'Add food').click()
  await expect(page.getByRole('checkbox', { name: /^Drinks?$/ })).toHaveCount(1)
  await expect(page.getByRole('checkbox', { name: 'Drinks' })).toHaveValue(drink.id)
})
