import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:4188',
    channel: process.env.PLANNER_BROWSER_CHANNEL || undefined,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4188 --strictPort',
    url: 'http://127.0.0.1:4188',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
