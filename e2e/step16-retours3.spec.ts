import { expect, test, type Page } from '@playwright/test'
import { clickWall, newProject, resetDb, setField, SHOTS, wallToPage } from './helpers'

async function poly(page: Page, pts: [number, number][]) {
  await page.getByTestId('tool-polyline').click()
  for (const [x, y] of pts) await clickWall(page, x, y)
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Retours 3', 320, 250)
})

test('pas de grille : valeurs proches donnant des colonnes / lignes entières', async ({ page }) => {
  await expect(page.getByTestId('step-suggestions')).toContainText('Colonnes entières')
  await expect(page.getByTestId('step-suggestions')).toContainText('40 cm')
  await expect(page.getByTestId('step-suggestions')).toContainText('64 cm')
  await page.locator('.side-panel').getByTestId('step-suggestions').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/step16-01-suggestions-pas.png` })
  await page.getByTestId('step-chip').filter({ hasText: '40 cm' }).first().click()
  await expect(page.getByTestId('grid-step')).toHaveValue('40')
  await expect(page.getByTestId('grid-summary')).toContainText('8 ×')
})

test('réglages : type de trait et épaisseur de la grille', async ({ page }) => {
  await page.getByTestId('open-settings').click()
  await page.getByTestId('line-style-dotted').click()
  await expect(page.getByTestId('grid-lines').first()).toHaveAttribute('data-line-style', 'dotted')
  const w = page.getByTestId('settings-modal').getByTestId('grid-width')
  await w.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('grid-lines').first()).toHaveAttribute('style', /--gw: ?2/)
  await page.screenshot({ path: `${SHOTS}/step16-02-reglages-trait-grille.png` })
  await page.getByTestId('line-style-solid').click()
  await expect(page.getByTestId('grid-lines').first()).toHaveAttribute('style', /--gd: ?none/)
})

test('palette : sélecteur de couleur riche, crayon pour renommer', async ({ page }) => {
  await poly(page, [[100, 0], [100, 250]])
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 50, 100)
  // ouvrir le sélecteur sur la teinte de l'ocre
  await page.getByTestId('swatch-Ocre').getByTestId('color-input').click()
  await expect(page.getByTestId('color-picker')).toBeVisible()
  await page.getByTestId('cp-swatch-4a6b4f').click()
  // aperçu en direct sur le dessin
  await expect(page.getByTestId('fills').locator('path').first()).toHaveAttribute('fill', '#4a6b4f')
  await page.screenshot({ path: `${SHOTS}/step16-03-selecteur-couleur.png` })
  await page.getByTestId('cp-tab-hsl').click()
  await page.screenshot({ path: `${SHOTS}/step16-04-selecteur-tsl.png` })
  await page.getByTestId('cp-apply').click()
  await expect(page.getByTestId('color-picker')).toHaveCount(0)
  await expect(page.getByTestId('fills').locator('path').first()).toHaveAttribute('fill', '#4a6b4f')
  // renommer avec le crayon ; un clic sur la ligne ne fait que choisir la couleur
  await page.getByTestId('swatch-Terracotta').click()
  await expect(page.getByTestId('rename-input')).toHaveCount(0)
  await page.getByTestId('swatch-Ocre').getByTestId('rename-color').click()
  await page.getByTestId('rename-input').fill('Vert forêt')
  await page.getByTestId('rename-input').press('Enter')
  await expect(page.getByTestId('swatch-Vert forêt')).toBeVisible()
})

test('historique dans le header, survol peinture au trait continu', async ({ page }) => {
  await poly(page, [[160, 0], [160, 250]])
  await page.getByTestId('tab-history').click()
  await expect(page.getByTestId('history-popover')).toBeVisible()
  await expect(page.getByTestId('history-count')).toHaveText('1 modification')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/step16-05-historique-header.png` })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('history-popover')).toHaveCount(0)
  await expect(page.locator('.side-tabs')).toHaveCount(0)

  await page.getByTestId('swatch-Bleu canard').click()
  const p = await wallToPage(page, 80, 120)
  await page.mouse.move(p.x, p.y)
  await expect(page.locator('[data-testid=region-hover] .rh-line')).toHaveCSS('stroke-dasharray', 'none')
  await expect(page.locator('[data-testid=region-hover] .rh-line')).toHaveCSS('stroke-width', '3.5px')
  await page.screenshot({ path: `${SHOTS}/step16-06-survol-peinture.png` })
})
