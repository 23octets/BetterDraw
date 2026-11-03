import { expect, test, type Page } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS } from './helpers'

async function poly(page: Page, pts: [number, number][], close = false) {
  await page.getByTestId('tool-polyline').click()
  for (const [x, y] of pts) await clickWall(page, x, y)
  if (close) await clickWall(page, pts[0][0], pts[0][1])
  else await page.keyboard.press('Enter')
}

test('snapshot, galerie de variantes et comparaison côte à côte', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Chambre')
  // variante A : bandes verticales
  await poly(page, [[100, 0], [100, 250]])
  await poly(page, [[200, 0], [200, 250]])
  await page.getByTestId('swatch-Bleu canard').click()
  await clickWall(page, 50, 100)
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 250, 100)

  // snapshot → variante B, qu'on modifie
  await page.getByTestId('variants-page').click()
  await page.getByTestId('snapshot').click()
  await expect(page.getByTestId('variant-name-input')).toHaveValue('Variante B')
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(2)
  await page.getByTestId('tab-history').click()
  await expect(page.getByTestId('history-count')).toHaveText('0 modification')
  await page.keyboard.press('Escape')
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 150, 100)
  await poly(page, [[0, 125], [100, 125]])
  await page.getByTestId('swatch-Vert sauge').click()
  await clickWall(page, 50, 200)

  // une 3e variante
  await page.getByTestId('variants-page').click()
  await page.getByTestId('snapshot').click()
  await expect(page.getByTestId('variant-name-input')).toHaveValue('Variante C')
  await page.getByTestId('swatch-Anthracite').click()
  await clickWall(page, 250, 100)

  // renommer la variante en cours directement dans l'en-tête
  await page.getByTestId('variant-name-input').fill('Variante C sombre')
  await page.getByTestId('variant-name-input').press('Enter')
  // la liste des variantes s'ouvre par-dessus l'éditeur
  await page.getByTestId('variants-page').click()
  await expect(page.getByTestId('variants-overlay')).toBeVisible()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await expect(page.getByTestId('variant-card')).toHaveCount(3)
  await expect(page.getByTestId('variant-card').nth(2)).toContainText('Variante C sombre')
  await expect(page.getByTestId('variant-card').nth(1)).toContainText('Issue de Variante A')
  await page.screenshot({ path: `${SHOTS}/step6-01-galerie-variantes.png` })

  await page.getByTestId('pick-variant').nth(0).check()
  await page.getByTestId('pick-variant').nth(1).check()
  await page.getByTestId('pick-variant').nth(2).check()
  await page.getByTestId('compare').click()
  await expect(page.getByTestId('compare-pane')).toHaveCount(3)
  await page.screenshot({ path: `${SHOTS}/step6-02-comparaison.png` })

  // l'original n'a pas bougé
  await page.getByTestId('compare-pane').first().getByRole('button', { name: 'Ouvrir ↗' }).click()
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(2)
})
