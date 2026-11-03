import { expect, test } from '@playwright/test'
import { clickWall, newProject, resetDb, setField, SHOTS, wallToPage } from './helpers'

test('mesure aimantée sur les traits et la grille ; aimantage dans les réglages', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Mesures')
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 0, 0)
  await clickWall(page, 300, 250)
  await page.keyboard.press('Enter')
  await page.getByTestId('tool-measure').click()
  // point A : croisement du trait avec la ligne de grille x = 100
  const a = await wallToPage(page, 100.8, 84)
  await page.mouse.move(a.x, a.y)
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'trait × grille')
  await page.mouse.click(a.x, a.y)
  // point B : nœud de grille (200, 200)
  const b = await wallToPage(page, 201, 199)
  await page.mouse.move(b.x, b.y)
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'nœud de grille')
  await page.mouse.click(b.x, b.y)
  await expect(page.getByTestId('measure-dx')).toHaveText('100 cm')
  await expect(page.getByTestId('measure-dy')).toHaveText('116.7 cm')
  await page.screenshot({ path: `${SHOTS}/step18-02-mesure-grille.png` })

  // l'aimantage se règle dans les Réglages
  await expect(page.locator('.side-panel').getByTestId('snap-step')).toHaveCount(0)
  await page.getByTestId('open-settings').click()
  await setField(page, 'snap-step', 10)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOTS}/step18-03-reglages-aimantage.png` })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Réglages' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Raccourcis clavier' })).toContainText('Raccourcis')
})
