import { test, expect, type Page } from '@playwright/test'
import { applyImport, button, chooseJSON, downloadJSON, exampleBackup, nav, openPlanner } from './interaction-helpers'

const routes = {
  Children: ['Setup', 'Children'],
  Schedules: ['Setup', 'Schedules'],
  Preferences: ['Setup', 'Preferences'],
  Catalog: ['Foods'],
  Inventory: ['Inventory'],
  Packing: ['Today'],
  'Full backup': ['Setup', 'Data'],
} as const

type Label = keyof typeof routes
async function showSection(page: Page, label: Label) {
  const [screen, tab] = routes[label]
  await nav(page, screen)
  if (tab) await button(page, tab).click()
}

for (const label of Object.keys(routes) as Label[]) {
  test(label + ' download, cancel, import and re-export after reload', async ({ page }) => {
    await openPlanner(page)
    if (label === 'Packing') {
      await nav(page, 'Week')
      await button(page, 'Generate week').click()
      await button(page, 'Generate plan').click()
      await nav(page, 'Today')
      await page.getByRole('checkbox').first().check()
    }
    await showSection(page, label)
    const transfer = page.locator('.transfer').filter({ has: page.getByLabel('Import ' + label + ' JSON', { exact: true }) })
    const read = () => downloadJSON(page, button(transfer, 'Export'))
    const original = await read()
    const edited = structuredClone(original)
    const data = edited.data
    switch (label) {
      case 'Children': data.children[0].name = 'Sample A'; break
      case 'Schedules': data.schedules[0].weekdays.Monday[0].name = 'Breakfast'; break
      case 'Preferences': data.preferences[0].rating = 'disliked'; break
      case 'Catalog': data.foods[0].name = 'Plain roll'; break
      case 'Inventory': data.entries[0].available = false; break
      case 'Packing': data.packedSlots[0].packed = false; break
      case 'Full backup': data.appState.children[0].name = 'Restored child'; break
    }
    await chooseJSON(page, label, edited)
    await button(page.getByRole('dialog'), 'Cancel').click()
    expect(await read()).toEqual(original)
    await chooseJSON(page, label, edited)
    if (label === 'Full backup') {
      const safetyCopy = await downloadJSON(page, button(page.getByRole('dialog'), 'Export existing full backup'))
      expect(safetyCopy).toEqual(original)
      await applyImport(page, 'Replace all data')
    } else {
      await expect(page.getByLabel('Import method')).toHaveValue('merge')
      await expect(page.getByRole('dialog')).toContainText('1 updated')
      await applyImport(page)
      expect(await read()).toEqual(edited)
      await chooseJSON(page, label, original)
      await page.getByLabel('Import method').selectOption('replace')
      await expect(page.getByRole('dialog')).toContainText('Records absent')
      await applyImport(page)
    }
    await page.reload()
    await showSection(page, label)
    expect(await read()).toEqual(label === 'Full backup' ? edited : original)
  })
}

test('bad files and week mismatches leave the original inventory intact', async ({ page }) => {
  await openPlanner(page)
  await nav(page, 'Inventory')
  const input = page.getByLabel('Import Inventory JSON')
  const original = await downloadJSON(page, button(page, 'Export'))
  for (const contents of [Buffer.from('{invalid'), Buffer.alloc(5 * 1024 * 1024 + 1, 32)]) {
    await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: contents })
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
    await expect(button(page, 'Apply import')).toBeDisabled()
    await button(page, 'Close').click()
  }
  await chooseJSON(page, 'Inventory', exampleBackup())
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  await button(page, 'Close').click()
  const otherWeek = structuredClone(original)
  otherWeek.data.weekStart = '2026-11-30'
  await chooseJSON(page, 'Inventory', otherWeek)
  await expect(button(page, 'Apply import')).toBeDisabled()
  await expect(page.getByRole('dialog')).toContainText(/week/i)
  await button(page, 'Cancel').click()
  expect(await downloadJSON(page, button(page, 'Export'))).toEqual(original)
})
