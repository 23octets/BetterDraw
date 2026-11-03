import { expect, test, type Page } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS, wallToPage } from './helpers'

const shapes = (page: Page) => page.getByTestId('shapes').locator('path')
async function poly(page: Page, pts: [number, number][]) {
  await page.getByTestId('tool-polyline').click()
  for (const [x, y] of pts) await clickWall(page, x, y)
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Retours')
})

test('infobulle des outils, raccourcis (bouton et ⌘ maintenu), grille dans le header', async ({ page }) => {
  await page.getByTestId('tool-trim').hover()
  const tip = page.getByTestId('tool-trim').locator('.tooltip')
  await expect(tip).toHaveCSS('opacity', '1')
  await expect(tip).toContainText('Couper')
  await page.screenshot({ path: `${SHOTS}/step9-01-infobulle.png`, clip: { x: 0, y: 40, width: 420, height: 520 } })

  await page.getByTestId('tool-polyline').click()
  await page.getByTestId('toggle-shortcuts').click()
  await expect(page.getByTestId('shortcuts-panel')).toBeVisible()
  await page.mouse.move(800, 500)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/step9-02-raccourcis.png` })
  await page.getByTestId('toggle-shortcuts').click()
  await expect(page.getByTestId('shortcuts-panel')).toHaveCount(0)
  await page.mouse.move(700, 400)
  await page.keyboard.down('Meta')
  await expect(page.getByTestId('shortcuts-panel')).toBeVisible()
  await page.keyboard.up('Meta')
  await expect(page.getByTestId('shortcuts-panel')).toHaveCount(0)

  await page.getByTestId('toggle-grid').click()
  await expect(page.getByTestId('grid-lines')).toHaveCount(0)
  await page.getByTestId('toggle-grid').click()
  await expect(page.getByTestId('grid-lines')).toHaveCount(1)
})

test('outil couper : supprimer un bout de ligne depuis une intersection', async ({ page }) => {
  await poly(page, [[20, 120], [280, 120]])
  await poly(page, [[100, 20], [100, 230]])
  await poly(page, [[200, 20], [200, 230]])
  await page.getByTestId('tool-trim').click()
  const p = await wallToPage(page, 150, 120)
  await page.mouse.move(p.x, p.y)
  await expect(page.getByTestId('trim-preview')).toHaveAttribute('d', 'M100 120L200 120')
  await page.screenshot({ path: `${SHOTS}/step9-03-outil-couper.png` })
  await page.mouse.click(p.x, p.y)
  await expect(shapes(page)).toHaveCount(4)
  await clickWall(page, 40, 120)
  await expect(shapes(page)).toHaveCount(3)
  await page.keyboard.press('Meta+z')
  await expect(shapes(page)).toHaveCount(4)
})

test('palette : sélecteur à gauche, estimation en modale, grille adaptée, pas de défilement horizontal', async ({ page }) => {
  await poly(page, [[100, 0], [100, 250]])
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 50, 100)
  await page.getByTestId('swatch-Anthracite').click()
  await clickWall(page, 200, 100)
  await expect(page.locator('[data-grid-on]')).toHaveCount(3)
  const noHScroll = await page.locator('.side-panel').evaluate((el) => el.scrollWidth <= el.clientWidth)
  expect(noHScroll).toBe(true)
  await page.screenshot({ path: `${SHOTS}/step9-04-palette-grille-adaptee.png` })
  await page.getByTestId('open-estimate').click()
  await expect(page.getByTestId('estimate-modal')).toContainText('Total à peindre')
  await page.screenshot({ path: `${SHOTS}/step9-05-modale-estimation.png` })
  await page.getByTestId('close-estimate').click()
})

test('consultation : clic = zoom, re-clic = dézoom, sous-grille réglable, pas de traits', async ({ page }) => {
  await poly(page, [[0, 170], [300, 170]])
  await page.getByTestId('swatch-Vert sauge').click()
  await clickWall(page, 100, 200)
  await page.getByTestId('mode-consult').click()
  await expect(page.getByTestId('shapes')).toHaveCount(0)
  await clickWall(page, 120, 190)
  await expect(page.getByTestId('consult-cell')).toHaveText('C2')
  await expect(page.getByTestId('sub-grid').locator('line')).toHaveCount(8)
  await page.getByTestId('sub-step').fill('5')
  await page.getByTestId('sub-step').press('Enter')
  await expect(page.getByTestId('sub-grid').locator('line')).toHaveCount(18)
  await page.screenshot({ path: `${SHOTS}/step9-06-consultation-sous-grille.png` })
  await clickWall(page, 120, 190)
  await expect(page.getByTestId('consult-cell')).toHaveText('Vue d’ensemble')
})

test('variante depuis l’historique et image qui suit le déplacement', async ({ page }) => {
  await poly(page, [[50, 50], [250, 50]])
  await poly(page, [[50, 100], [250, 100]])
  await page.getByTestId('tab-history').click()
  await page.getByTestId('history-item').filter({ hasText: '#1' }).hover()
  await page.screenshot({ path: `${SHOTS}/step9-07-historique-variante.png` })
  await page.getByRole('button', { name: 'Créer une variante depuis l’état #1' }).click()
  await expect(page.getByTestId('variant-name-input')).toHaveValue('Variante B')
  await expect(shapes(page)).toHaveCount(1)

  await page.keyboard.press('Escape')
  await page.getByTestId('image-input').setInputFiles('e2e/fixtures/croquis.png')
  const img = page.getByTestId('ref-image')
  const x0 = +(await img.getAttribute('x'))!
  const a = await wallToPage(page, 150, 125)
  const b = await wallToPage(page, 170, 125)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 4 })
  // pendant le glisser, l'image elle-même a bougé
  expect(+(await img.getAttribute('x'))!).toBeCloseTo(x0 + 20, 0)
  await page.mouse.up()
  // curseur de redimensionnement sur un coin
  const im = { x: +(await img.getAttribute('x'))!, y: +(await img.getAttribute('y'))! }
  const c = await wallToPage(page, im.x, im.y)
  await page.mouse.move(c.x, c.y)
  await expect(page.getByTestId('canvas')).toHaveCSS('cursor', 'nwse-resize')
  // masquer l'image ne fait pas bouger les boutons
  const before = await page.getByTestId('image-lock').boundingBox()
  await page.getByTestId('image-visible').click()
  const after = await page.getByTestId('image-lock').boundingBox()
  expect(after).toEqual(before)
})
