import { expect, test } from '@playwright/test'
import { clickWall, newProject } from './helpers'

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
  await page.goto('/')
  const link = page.getByRole('button', { name: 'Mentions légales', exact: true })
  await link.click()
  await expect(page.getByRole('dialog')).toContainText('IndexedDB')
  await expect(page.getByRole('dialog')).toContainText('98434012500017')
  await expect(page.getByRole('dialog').getByRole('link', { name: 'contact@23o.dev' })).toHaveAttribute('href', 'mailto:contact@23o.dev')
  await page.keyboard.press('Escape')
  await expect(link).toBeFocused()
  await newProject(page, 'Confidentialité')
  await page.getByTestId('image-input').setInputFiles('e2e/fixtures/mur-perspective.png')
  await expect(page.getByTestId('ref-image')).toHaveCount(1)
  await page.getByTestId('tool-polyline').click()
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
