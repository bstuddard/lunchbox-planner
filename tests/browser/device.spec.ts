import { expect, test } from '@playwright/test'
import { applyImport, button, chooseJSON, downloadJSON, exampleBackup } from './interaction-helpers'

test('device settings reflect storage decisions and browser installation events', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false })
    let requests = 0
    Object.defineProperty(navigator.storage, 'persist', { value: async () => ++requests > 1 })
  })
  await page.goto('./#setup')
  await button(page, 'Data').click()
  await expect(page.getByText('Best effort', { exact: true })).toBeVisible()
  const request = button(page, 'Request persistent storage')
  await request.click()
  await expect(page.getByText('Denied', { exact: true })).toBeVisible()
  await request.click()
  await expect(page.getByText('Granted', { exact: true })).toBeVisible()
  for (const outcome of ['dismissed', 'accepted']) {
    await page.evaluate(outcome => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => document.body.dataset.prompted = outcome,
        userChoice: Promise.resolve({ outcome }),
      }))
    }, outcome)
    await button(page, 'Install app').click()
    await expect(page.locator('body')).toHaveAttribute('data-prompted', outcome)
    await expect(button(page, 'Install app')).toHaveCount(0)
    if (outcome === 'accepted') await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  }
  await expect(page.getByText(/Standalone mode/)).toBeVisible()
})

test('corrupt local records can be downloaded intact before restoring a backup', async ({ page }) => {
  await page.goto('./#foods')
  await expect(button(page, 'Saved on this device')).toBeVisible()
  // This origin belongs to the isolated test context. Corrupt its synthetic record only.
  const damaged = { revision: 2, savedAt: '2026-11-23T12:00:00Z', state: { stateVersion: 99 } }
  await page.evaluate(damaged => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('lunchbox-planner', 1)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('snapshots', 'readwrite')
      tx.objectStore('snapshots').put(damaged, 'current')
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  }), damaged)
  await page.reload()
  await expect(button(page, 'Unsaved')).toBeVisible()
  await button(page, 'Open backup & recovery').click()
  expect(await downloadJSON(page, button(page, 'Download original recovery snapshot'))).toEqual(damaged)
  const backup = exampleBackup()
  await chooseJSON(page, 'Full backup', backup)
  await applyImport(page, 'Replace all data')
  await page.reload()
  await button(page, 'Data').click()
  expect(await downloadJSON(page, button(page.getByRole('main'), 'Export full backup'))).toEqual(backup)
  await expect(button(page, 'Download original recovery snapshot')).toHaveCount(0)
})
