import { expect, test, type Page } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS, wallToPage } from './helpers'

async function poly(page: Page, pts: [number, number][]) {
  await page.getByTestId('tool-polyline').click()
  for (const [x, y] of pts) await clickWall(page, x, y)
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Retours 2')
})

test('menu de la grille : épaisseur et opacité', async ({ page }) => {
  await page.getByTestId('grid-menu').click()
  await expect(page.getByTestId('grid-popover')).toBeVisible()
  const w = page.getByTestId('grid-width')
  await w.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  const o = page.getByTestId('grid-opacity')
  await o.focus()
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('grid-popover')).toContainText('2.0 px')
  await expect(page.getByTestId('grid-popover')).toContainText('70 %')
  const g = page.getByTestId('grid-lines')
  await expect(g).toHaveAttribute('opacity', '0.7')
  await expect(g).toHaveAttribute('style', /--gw: ?2/)
  await page.screenshot({ path: `${SHOTS}/step10-01-menu-grille.png` })
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await page.reload()
  await expect(page.getByTestId('grid-lines')).toHaveAttribute('opacity', '0.7')
})

test('Échap revient à l’outil de sélection ; infobulles immédiates d’un outil à l’autre', async ({ page }) => {
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 50, 50)
  await page.keyboard.press('Escape') // annule le tracé en cours
  await expect(page.getByTestId('tool-polyline')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape') // rien en cours : retour sélection
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('tool-fill').click()
  await page.mouse.move(700, 400)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('tool-arc').hover()
  await page.waitForTimeout(300)
  await expect(page.getByTestId('toolbar')).toHaveClass(/warm/)
  await page.getByTestId('tool-bezier').hover()
  // affichée tout de suite, sans transition
  await expect(page.getByTestId('tool-bezier').locator('.tooltip')).toHaveCSS('opacity', '1', { timeout: 50 })
})

test('mesure : infos dans le footer, Shift garde l’aimant sur le bord du mur', async ({ page }) => {
  await page.getByTestId('tool-measure').click()
  await expect(page.getByTestId('measure-bar')).toBeVisible()
  await clickWall(page, 100, 100)
  const near = await wallToPage(page, 297, 103)
  await page.keyboard.down('Shift')
  await page.mouse.move(near.x, near.y, { steps: 3 })
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'bord du mur')
  await page.mouse.click(near.x, near.y)
  await page.keyboard.up('Shift')
  await expect(page.getByTestId('measure-distance')).toHaveText('200 cm')
  await expect(page.getByTestId('measure-dy')).toHaveText('0 cm')
  // la pastille de mesure est à gauche du zoom
  const mb = (await page.getByTestId('measure-bar').boundingBox())!
  const zb = (await page.getByTestId('zoom').boundingBox())!
  expect(mb.x + mb.width).toBeLessThan(zb.x)
  expect(Math.abs(mb.y + mb.height / 2 - (zb.y + zb.height / 2))).toBeLessThan(4)
  await page.screenshot({ path: `${SHOTS}/step10-02-mesure-footer.png` })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('measure-bar')).toHaveCount(0)
})

test('vue détail : case mise en évidence et curseur loupe −', async ({ page }) => {
  await poly(page, [[0, 170], [300, 170]])
  await poly(page, [[60, 0], [260, 250]])
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 30, 30)
  await page.getByTestId('swatch-Bleu canard').click()
  await clickWall(page, 200, 80)
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 50, 220)
  await page.getByTestId('mode-consult').click()
  await expect(page.getByTestId('canvas')).toHaveCSS('cursor', 'zoom-in')
  await clickWall(page, 225, 75)
  await expect(page.getByTestId('consult-veil')).toHaveCount(1)
  await expect(page.getByTestId('canvas')).toHaveCSS('cursor', 'zoom-out')
  await page.mouse.move(10, 10)
  await page.screenshot({ path: `${SHOTS}/step10-03-vue-detail.png` })
})
