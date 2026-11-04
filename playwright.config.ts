import { defineConfig } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  // en CI, le rendu WebGL est logiciel : la 3D et les enregistrements sont bien plus lents
  timeout: isCI ? 120_000 : 60_000,
  expect: { timeout: isCI ? 15_000 : 5_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: isCI ? 'on-first-retry' : 'off',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5199',
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
