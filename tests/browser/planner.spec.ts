import { test, expect, chromium } from '@playwright/test'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
const url = 'http://127.0.0.1:4188/'
test('installed shell supports offline setup, scoped generation, packing, exports and recovery', async ({
  page,
  context,
  browser,
}, info) => {
  const external = new Set<string>()
  context.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(url))
      external.add(r.url())
  })
  const errors: string[] = []
  const policyViolations: string[] = []
  await page.exposeFunction('recordPlannerPolicyViolation', (directive: string) => {
    policyViolations.push(directive)
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      const report = (window as Window & { recordPlannerPolicyViolation: (directive: string) => void }).recordPlannerPolicyViolation
      report(event.effectiveDirective)
    })
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /style-src 'self';/)
  await expect(
    page.getByRole('heading', { name: 'Today’s lunchbox' }),
  ).toBeVisible()
  await expect(
    page.getByText('Ready for offline use', { exact: true }),
  ).toBeVisible()
  const manifest = await (
    await context.request.get(url + 'manifest.webmanifest')
  ).json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.scope).toBe('/')
  expect(
    manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512'),
  ).toBeTruthy()
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)
  await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.screenshot({
    path: info.outputPath('desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy()
  await context.setOffline(true)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Today’s lunchbox' }),
  ).toBeVisible()
  const nav = (name: string) =>
    page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('button', { name, exact: true })
      .click()
  await page.getByRole('button', { name: 'Set up planner' }).click()
  await page
    .getByLabel('Child name', { exact: true })
    .first()
    .fill('Test child')
  await page.getByRole('button', { name: 'Save name' }).first().click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Add food', exact: true }).click()
  await page.getByLabel('Food name').fill('Apple slices')
  await page.getByRole('checkbox', { name: 'Snack', exact: true }).check()
  await page.getByRole('button', { name: 'Save food' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Monday meals' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Apple slices availability' }).click()
  await page.getByRole('button', { name: 'Quick add food' }).click()
  await page.getByLabel('Food name').fill('Roll')
  await page.getByRole('checkbox', { name: 'Main', exact: true }).check()
  await page.getByRole('button', { name: 'Save food' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByRole('button', { name: 'Generate week', exact: true })
    .first()
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Generate plan', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Weekly prep' })).toBeVisible()
  await nav('Today')
  await page.getByRole('checkbox').first().check()
  const packed = page.getByText(/1 of \d+ packed/)
  await expect(packed).toBeVisible()
  expect(await page.locator('.child-card .track i').first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Saved on this device', exact: true })).toBeVisible()
  await page.reload()
  await expect(packed).toBeVisible()
  await nav('Setup')
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.getByRole('button', { name: 'Apple slices disliked' }).click()
  await nav('Inventory')
  await page.getByRole('button', { name: 'Roll availability' }).click()
  await page.locator('summary').click()
  await expect(page.getByText('Roll is unavailable.').first()).toBeVisible()
  await nav('Week')
  await page
    .getByRole('button', { name: 'Regenerate week', exact: true })
    .click()
  await expect(
    page.getByText(/1 checked packing item will be cleared/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await nav('Setup')
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  const dl = page.waitForEvent('download')
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Export full backup', exact: true })
    .click()
  const file = await dl,
    path = await file.path()
  const backup = JSON.parse(await readFile(path!, 'utf8'))
  expect(backup.data.appState.weeklyPlans[0].packedSlots).toHaveLength(1)
  expect(backup.data.appState.children[0].name).toBe('Test child')
  await nav('Foods')
  const catalogDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const catalog = JSON.parse(
    await readFile((await (await catalogDownload).path())!, 'utf8'),
  )
  catalog.data.foods[0].name = 'Green apple'
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'catalog.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(catalog)),
    })
  await expect(page.getByText(/1 updated/)).toBeVisible()
  await page.getByRole('button', { name: 'Apply import' }).click()
  await expect(page.getByText('Green apple', { exact: true })).toBeVisible()
  const fresh = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  try {
    const restored = await fresh.newPage()
    await restored.goto(url + '#setup')
    await restored.getByRole('button', { name: 'Data', exact: true }).click()
    await restored
      .locator('input[aria-label="Import Full backup JSON"]')
      .setInputFiles({
        name: 'backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup)),
      })
    await restored.getByRole('button', { name: 'Replace all data' }).click()
    await restored
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('button', { name: 'Today' })
      .click()
    await expect(restored.getByText(/1 of \d+ packed/)).toBeVisible()
  } finally {
    await fresh.close()
  }
  expect(errors).toEqual([])
  expect(policyViolations).toEqual([])
  expect([...external]).toEqual([])
})
test('a persistent profile relaunches offline and updates only on request', async () => {
  // Serve two app-shell versions from the same loopback origin. Only the
  // worker script changes, exactly as in a static-host update.
  let version = 1
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, 'http://localhost').pathname
      if (!/^\/[a-zA-Z0-9_./-]*$/.test(pathname) || pathname.includes('..')) {
        res.writeHead(400).end()
        return
      }
      const file = pathname === '/' ? 'index.html' : pathname.slice(1)
      const data = await readFile(join(process.cwd(), 'dist', file))
      const type = file.endsWith('.js')
        ? 'application/javascript'
        : file.endsWith('.html')
          ? 'text/html'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.webmanifest')
              ? 'application/manifest+json'
              : 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
      res.end(
        file === 'sw.js'
          ? Buffer.concat([data, Buffer.from('\n// release ' + version)])
          : data,
      )
    } catch {
      res.writeHead(404).end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  const profile = await mkdtemp(join(tmpdir(), 'planner-browser-'))
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      channel: process.env.PLANNER_BROWSER_CHANNEL || undefined,
      viewport: { width: 390, height: 844 },
    })
  let ctx = await launch()
  try {
    let page = ctx.pages()[0]
    await page.goto(origin + '/#setup')
    await expect(
      page.getByText('Ready for offline use', { exact: true }),
    ).toBeVisible()
    await page
      .getByLabel('Child name', { exact: true })
      .first()
      .fill('Saved child')
    await page.getByRole('button', { name: 'Save name' }).first().click()
    await expect(
      page.getByRole('button', { name: 'Saved on this device' }),
    ).toBeVisible()
    await ctx.close()
    ctx = await launch()
    await ctx.setOffline(true)
    page = ctx.pages()[0]
    await page.goto(origin + '/#setup')
    await expect(
      page.getByLabel('Child name', { exact: true }).first(),
    ).toHaveValue('Saved child')
    await ctx.setOffline(false)
    await page
      .getByLabel('Child name', { exact: true })
      .first()
      .fill('Unsubmitted edit')
    version++
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update()
    })
    await expect(page.getByRole('button', { name: 'Update now' })).toBeVisible({
      timeout: 15000,
    })
    await expect(
      page.getByLabel('Child name', { exact: true }).first(),
    ).toHaveValue('Unsubmitted edit')
    const updateBackup = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export backup', exact: true }).click()
    const backupPath = await (await updateBackup).path()
    expect(JSON.parse(await readFile(backupPath!, 'utf8')).data.appState.children[0].name).toBe('Saved child')
    await page.getByRole('button', { name: 'Save name' }).first().click()
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Update now' }).click(),
    ])
    await expect(
      page.getByLabel('Child name', { exact: true }).first(),
    ).toHaveValue('Unsubmitted edit')
    version++
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update() })
    await page.getByRole('button', { name: 'Data', exact: true }).click()
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'Apply update', exact: true }).click(),
    ])
    await expect(page.getByLabel('Child name', { exact: true }).first()).toHaveValue('Unsubmitted edit')
  } finally {
    await ctx.close()
    server.closeAllConnections()
    server.close()
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 4,
      retryDelay: 200,
    })
  }
})
