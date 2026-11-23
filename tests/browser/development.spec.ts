import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { createServer, isFileServingAllowed, normalizePath } from 'vite'

test('development serves the planner and its images with a restricted file policy', async ({ page }) => {
  const server = await createServer({
    base: '/planner/',
    server: { host: '127.0.0.1', port: 0, open: false },
  })
  try {
    await server.listen()
    expect(server.config.publicDir).toBe('')
    const allowed = (file: string) => isFileServingAllowed(server.config, '/@fs/' + normalizePath(resolve(file)))
    expect(allowed('src/main.ts')).toBe(true)
    expect(allowed('public/icons/icon-192.png')).toBe(true)
    for (const sample of ['example-backup.json', 'src/example.json', 'public/example.json', '.private/example.txt'])
      expect(allowed(sample), sample).toBe(false)

    const address = server.httpServer!.address()
    if (!address || typeof address === 'string') throw Error('Missing development server port')
    const base = 'http://127.0.0.1:' + address.port + '/planner/'
    await page.goto(base)
    await expect(page.getByRole('heading', { name: 'Today’s lunchbox' })).toBeVisible({ timeout: 30000 })
    await expect.poll(() => page.locator('.hero-art img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    const icon = await page.request.get(base + 'icons/icon-192.png')
    expect(icon.headers()['content-type']).toContain('image/png')
  } finally {
    await server.close()
  }
})
