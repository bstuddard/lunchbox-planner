import { chromium, devices, expect, test, type Page } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { seedState } from '../../src/domain/model'
import { schemaFor } from '../../src/data/schemaDefinitions'

const foods = Array.from({ length: 13 }, (_, i) => ({
  id: 'fixture-' + i,
  name: 'Catalog item ' + (i + 1),
  categoryIds: ['cat-snack'],
  archived: false,
}))
const catalog = {
  schema: schemaFor('catalog'),
  data: { section: 'catalog', formatVersion: 1, categories: seedState().categories, foods },
}

async function chooseFile(page: Page, label: string, payload: unknown) {
  await page.getByLabel('Import ' + label + ' JSON', { exact: true }).setInputFiles({
    name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)),
  })
}
async function saved(page: Page) {
  await expect(page.getByRole('button', { name: 'Saved on this device', exact: true })).toBeVisible()
}
async function apply(page: Page, button = 'Apply import') {
  await page.getByRole('dialog').getByRole('button', { name: button }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await saved(page)
}
async function exported(page: Page, name = 'Export') {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('main').getByRole('button', { name, exact: true }).click(),
  ])
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}

test('13 catalog foods, later edits, inventory, schedules and restored backup survive offline browser restarts', async ({ baseURL }) => {
  const profile = await mkdtemp(join(tmpdir(), 'planner-catalog-'))
  const launch = () => chromium.launchPersistentContext(profile, {
    ...devices['Pixel 7'],
    channel: process.env.PLANNER_BROWSER_CHANNEL || undefined,
  })
  let context = await launch()
  let page = context.pages()[0]
  const route = (section: string) => page.goto(baseURL + '/#' + section)
  async function reopen(section: string) {
    await context.close()
    context = await launch()
    await context.setOffline(true)
    page = context.pages()[0]
    await route(section)
    await saved(page)
  }
  try {
    await route('foods')
    await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible()
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    await chooseFile(page, 'Catalog', catalog)
    await apply(page)
    await reopen('foods')
    expect((await exported(page)).data.foods).toEqual(foods)

    await page.getByRole('button', { name: 'Edit Catalog item 1', exact: true }).click()
    await page.getByLabel('Food name').fill('Edited catalog item')
    await page.getByRole('checkbox', { name: 'Main', exact: true }).check()
    await page.getByRole('button', { name: 'Save food' }).click()
    await saved(page)
    await page.reload()
    const edited = (await exported(page)).data.foods
    expect(edited).toHaveLength(13)
    expect(edited[0]).toEqual({ ...foods[0], name: 'Edited catalog item', categoryIds: ['cat-snack', 'cat-main'], notes: '' })

    await route('inventory')
    const inventory = await exported(page)
    inventory.data.entries = [{foodId: foods[0].id, available: true}]
    await chooseFile(page, 'Inventory', inventory)
    await apply(page)
    await page.reload()
    expect((await exported(page)).data).toEqual(inventory.data)

    await route('setup')
    await page.getByRole('button', { name: 'Schedules', exact: true }).click()
    await page.getByRole('button', { name: 'Edit Morning snack', exact: true }).click()
    await page.getByLabel('Quantity').fill('2')
    await page.getByRole('button', { name: 'Save meal' }).click()
    await saved(page)
    await page.getByRole('button', { name: 'Data', exact: true }).click()
    const backup = await exported(page, 'Export full backup')
    expect(backup.data.appState.schedules[0].weekdays.Monday[0].requirements[0].count).toBe(2)
    expect(backup.data.appState.foods).toEqual(edited)
    expect(backup.data.appState.weeklyInventories[0].entries).toEqual(inventory.data.entries)

    // Overwrite an existing record, then restore the original full backup.
    await route('foods')
    await chooseFile(page, 'Catalog', catalog)
    await apply(page)
    await route('setup')
    await page.getByRole('button', { name: 'Data', exact: true }).click()
    await chooseFile(page, 'Full backup', backup)
    await apply(page, 'Replace all data')
    await reopen('setup')
    await page.getByRole('button', { name: 'Data', exact: true }).click()
    expect((await exported(page, 'Export full backup')).data).toEqual(backup.data)
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 })
  }
})

test('an aborted import never reports success and can be retried', async ({ page }) => {
  await page.goto('/#foods')
  await saved(page)
  await chooseFile(page, 'Catalog', catalog)
  // A successful put request still precedes the transaction's commit.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args)
      IDBObjectStore.prototype.put = put
      request.addEventListener('success', () => this.transaction.abort())
      return request
    }
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Apply import' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Import was not saved')
  await expect(page.locator('.save-badge')).toHaveText('Unsaved')
  await expect(page.getByText('Import applied', { exact: true })).toHaveCount(0)
  await apply(page)
  await page.reload()
  expect((await exported(page)).data.foods).toEqual(foods)
})
