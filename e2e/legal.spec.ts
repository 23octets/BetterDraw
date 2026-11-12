import { expect, test } from '@playwright/test'
import { clickWall, newProject } from './helpers'
import { legal } from '../src/config/legal'

test('@essentiel mentions accessibles et parcours principal sans réseau tiers', async ({ page, context, baseURL }) => {
  const external: string[] = []
  const origin = new URL(baseURL!).origin
  // Observer les tentatives, même si la requête échoue ; inclut polices, scripts et images.
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) external.push(request.url())
  })
  context.on('page', (opened) => opened.on('websocket', (socket) => {
    if (new URL(socket.url()).host !== new URL(origin).host) external.push(socket.url())
  }))
  page.on('websocket', (socket) => {
    if (new URL(socket.url()).host !== new URL(origin).host) external.push(socket.url())
  })
  await page.route('**/api/cloud', (route) => route.fulfill({ json: { databaseUrl: 'https://compte-test.dexie.cloud' } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible()
  const link = page.getByRole('button', { name: 'Mentions légales', exact: true })
  await link.click()
  await expect(page.getByRole('dialog')).toContainText('IndexedDB')
  await expect(page.getByRole('dialog')).toContainText('En mode invité')
  await expect(page.getByRole('dialog')).toContainText('En mode connecté')
  await expect(page.getByRole('dialog')).toContainText('Cloudflare D1')
  await expect(page.getByRole('dialog')).toContainText('98434012500017')
  await expect(page.getByRole('dialog').getByRole('link', { name: 'contact@23o.dev' })).toHaveAttribute('href', 'mailto:contact@23o.dev')
  await page.keyboard.press('Escape')
  await expect(link).toBeFocused()
  await newProject(page, 'Confidentialité')
  await page.getByTestId('image-input').setInputFiles('e2e/fixtures/mur-perspective.png')
  await expect(page.getByTestId('ref-image')).toHaveCount(1)
  await page.getByTestId('tool-polyline').click()
  await link.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByTestId('tool-polyline')).toHaveAttribute('aria-pressed', 'true')
  await clickWall(page, 0, 120)
  await clickWall(page, 300, 120)
  await page.keyboard.press('Enter')
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 100, 180)
  await link.click()
  await expect(page.getByRole('dialog')).toContainText('sauvegarde JSON')
  await page.getByRole('button', { name: 'Fermer les mentions légales' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByTestId('mode-consult').click()
  await page.getByTestId('export').click()
  for (const format of ['pdf', 'png', 'svg', 'json']) {
    await Promise.all([page.waitForEvent('download'), page.getByTestId(`export-${format}`).click()])
  }
  expect(external, 'Aucune tentative de connexion à un tiers sur ce parcours').toEqual([])
})

for (const width of [390, 768, 1024, 1440]) {
  test(`@essentiel mentions lisibles à ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const button = page.getByRole('button', { name: 'Mentions légales', exact: true })
    const fits = () => button.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return el.scrollWidth <= el.clientWidth && box.left >= 0 && box.right <= innerWidth
    })
    await expect.poll(fits).toBe(true)
    await button.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await newProject(page)
    await expect.poll(fits).toBe(true)
    await button.click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
}

test('@essentiel titre du produit servi sans JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto(baseURL!)
    await expect(page).toHaveTitle(legal.productName)
  } finally {
    await context.close()
  }
})


test('@essentiel notice accessible avant de saisir son email', async ({ page }) => {
  await page.route('**/api/cloud', (route) => route.fulfill({ json: { databaseUrl: 'https://compte-test.dexie.cloud' } }))
  await page.route('https://compte-test.dexie.cloud/**', (route) => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Se connecter par email' })).toBeVisible()
  await page.getByRole('button', { name: 'Mentions légales', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Compte et synchronisation')
  await expect(page.getByRole('dialog')).toContainText('Dexie Cloud')
})
