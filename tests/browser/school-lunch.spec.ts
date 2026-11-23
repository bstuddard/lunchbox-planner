import { chromium, devices, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyImport, button, chooseJSON, downloadJSON, exampleBackup, nav, openPlanner, saved } from './interaction-helpers'

test('dated school lunches survive offline relaunch and full backup restoration', async ({ baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(), 'planner-school-lunch-'))
  const launch = () => chromium.launchPersistentContext(profile, {
    ...devices['Pixel 7'], channel: process.env.PLANNER_BROWSER_CHANNEL || undefined, baseURL,
  })
  let context = await launch()
  let page = context.pages()[0]
  const toggle = (child: number) => page.getByRole('article').nth(child).getByRole('checkbox', { name: 'Buying School Lunch' })
  const today = async () => {
    const cards = page.getByRole('article')
    await expect(cards.first().getByText('Buying School Lunch')).toBeVisible()
    await expect(cards.first().getByRole('heading', { name: 'Lunch', exact: true })).toHaveCount(0)
    await expect(cards.first().getByRole('checkbox')).toHaveCount(2)
    await expect(cards.nth(1).getByRole('heading', { name: 'Lunch', exact: true })).toBeVisible()
  }
  try {
    const wednesday = new Date(2026, 10, 25, 12)
    await page.clock.setFixedTime(wednesday)
    await page.goto('./#setup')
    await button(page, 'Data').click()
    const backup = exampleBackup()
    const state = backup.data.appState
    state.schedules[0].weekdays.Wednesday[0].requirements[0].count = 2
    state.schedules[0].weekdays.Wednesday[1].requirements.push({ categoryId: 'cat-drink', count: 1 })
    state.foods.push({ id: 'water', name: 'Water', categoryIds: ['cat-drink'], archived: false })
    state.weeklyInventories[0].entries.push({ foodId: 'water', available: true })
    await chooseJSON(page, 'Full backup', backup)
    await applyImport(page, 'Replace all data')
    await nav(page, 'Week')
    await button(page, /^Wed/).click()
    await toggle(0).check()
    await saved(page)
    await expect(toggle(1)).not.toBeChecked()
    await button(page, /^Fri/).click()
    await toggle(1).check()
    await button(page, 'Generate week').click()
    await button(page, 'Generate plan').click()
    await nav(page, 'Today')
    await today()
    await page.getByRole('article').first().getByRole('checkbox').first().check()
    await saved(page)
    await button(page, 'Saved on this device').click()
    const exported = await downloadJSON(page, button(page.getByRole('main'), 'Export full backup'))
    expect(exported.data.appState.schoolLunches).toEqual([
      { date: '2026-11-25', childId: 'child-1', mealId: 'lunch' },
      { date: '2026-11-27', childId: 'child-2', mealId: 'lunch' },
    ])
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    await context.close()
    context = await launch()
    await context.setOffline(true)
    page = context.pages()[0]
    await page.clock.setFixedTime(wednesday)
    await page.goto('./#today')
    await today()
    await expect(page.getByRole('article').first().getByRole('checkbox').first()).toBeChecked()
    await nav(page, 'Week')
    await button(page, /^Wed/).click()
    await expect(toggle(0)).toBeChecked()
    await button(page, 'Next week').click()
    await button(page, /^Wed/).click()
    await expect(toggle(0)).not.toBeChecked()
    await button(page, 'Previous week').click()
    await button(page, /^Wed/).click()
    await toggle(0).uncheck()
    await saved(page)
    await nav(page, 'Today')
    const first = page.getByRole('article').first()
    await expect(first.getByRole('checkbox', { name: 'Water' })).toBeVisible()
    await expect(first.getByRole('checkbox').first()).toBeChecked()
    await button(page, 'Saved on this device').click()
    await chooseJSON(page, 'Full backup', exported)
    await applyImport(page, 'Replace all data')
    await nav(page, 'Today')
    await today()
    await nav(page, 'Week')
    await button(page, /^Fri/).click()
    await expect(toggle(1)).toBeChecked()
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 })
  }
})

test('a custom meal can be replaced and a failed write reports failure until retry commits', async ({ page }) => {
  const backup = exampleBackup()
  const meal = backup.data.appState.schedules[0].weekdays.Monday[1]
  meal.id = 'midday'
  meal.name = 'Midday box'
  await openPlanner(page, backup)
  await nav(page, 'Week')
  await button(page, 'Generate week').click()
  await button(page, 'Generate plan').click()
  const card = page.getByRole('article').first()
  await card.getByLabel('Packed meal to replace').selectOption('midday')
  await saved(page)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args)
      if (this.transaction.db.name === 'lunchbox-planner' && this.name === 'snapshots' &&
          args[1] === 'current' && args[0]?.state?.schoolLunches?.some(
            (e: { mealId: string }) => e.mealId === 'midday')) {
        IDBObjectStore.prototype.put = put
        request.addEventListener('success', () => this.transaction.abort())
      }
      return request
    }
  })
  await card.getByRole('checkbox', { name: 'Buying School Lunch' }).check()
  await expect(card.getByRole('alert')).toContainText('hasn’t been saved')
  await expect(button(page, 'Unsaved')).toBeVisible()
  await expect(page.getByText(/^Lunch choice saved/)).toHaveCount(0)
  await button(card, 'Retry save').click()
  await saved(page)
  await page.reload()
  await expect(card.getByRole('checkbox', { name: 'Buying School Lunch' })).toBeChecked()
  await expect(card.getByRole('heading', { name: 'Morning snack' })).toBeVisible()
  await expect(card.getByRole('heading', { name: 'Midday box' })).toHaveCount(0)
  await card.getByRole('checkbox', { name: 'Buying School Lunch' }).uncheck()
  await expect(card.getByRole('heading', { name: 'Midday box' })).toBeVisible()
})
