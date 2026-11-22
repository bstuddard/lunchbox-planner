import { expect, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { seedState } from '../../src/domain/model'
import { schemaFor } from '../../src/data/schemaDefinitions'

export const button = (page: Page | Locator, name: string | RegExp) =>
  page.getByRole('button', { name, exact: true })

export async function nav(page: Page, name: string) {
  await button(page.getByRole('navigation', { name: 'Mobile navigation' }), name).click()
}

export async function saved(page: Page) {
  await expect(button(page, 'Saved on this device')).toBeVisible()
}

export async function downloadJSON(page: Page, trigger: Locator) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger.click()])
  return JSON.parse(await readFile((await file.path())!, 'utf8'))
}

export async function chooseJSON(page: Page, section: string, value: unknown) {
  const transfer = page.locator('.transfer').filter({ has: page.getByLabel('Import ' + section + ' JSON', { exact: true }) })
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), button(transfer, 'Import').click()])
  await picker.setFiles({ name: 'example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) })
}

export async function applyImport(page: Page, action = 'Apply import') {
  await button(page.getByRole('dialog'), action).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await saved(page)
}

export function exampleBackup() {
  const state = seedState()
  state.foods = [
    { id: 'roll', name: 'Roll', categoryIds: ['cat-main'], archived: false },
    { id: 'apple', name: 'Apple', categoryIds: ['cat-snack', 'cat-fruit'], archived: false },
    { id: 'beans', name: 'Beans', categoryIds: ['cat-snack'], archived: false },
  ]
  state.weeklyInventories.push({
    weekStart: '2026-11-23', updatedAt: '2026-11-23T12:00:00Z',
    entries: state.foods.map(f => ({foodId: f.id, available: true})),
  })
  state.preferences.push({ childId: 'child-1', foodId: 'roll', rating: 'liked' })
  return { schema: schemaFor('backup'), data: {section: 'backup', formatVersion: 1, appState: state} }
}

export async function openPlanner(page: Page, backup = exampleBackup()) {
  await page.clock.setFixedTime(new Date(2026, 10, 23, 12))
  await page.goto('./#setup')
  await button(page, 'Data').click()
  await chooseJSON(page, 'Full backup', backup)
  await applyImport(page, 'Replace all data')
}

export async function confirmAction(page: Page, trigger: Locator, accept: boolean) {
  const handled = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.type()).toBe('confirm')
    if (accept) await dialog.accept()
    else await dialog.dismiss()
  })
  await Promise.all([handled, trigger.click()])
}
