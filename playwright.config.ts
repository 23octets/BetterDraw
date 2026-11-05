import { defineConfig } from '@playwright/test'

const isCI = !!process.env.CI
const port = process.env.BETTERDRAW_TEST_PORT ?? '5199'
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  // en CI, le rendu WebGL est logiciel : la 3D et les enregistrements sont bien plus lents
  timeout: isCI ? 120_000 : 60_000,
  expect: {
    timeout: isCI ? 15_000 : 5_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.002 },
  },
  // références produites sur le runner Linux de la CI : elles ne valent pas sur une autre machine
  testIgnore: isCI ? [] : ['**/visual.spec.ts'],
  snapshotPathTemplate: 'e2e/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  // 3 workers mesurés sur les runners à 4 CPU ; en local, un seul pour ne pas dépendre de la machine
  workers: isCI ? 3 : 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: isCI ? 'on-first-retry' : 'off',
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !isCI && !process.env.BETTERDRAW_TEST_PORT,
    timeout: 60_000,
  },
})
