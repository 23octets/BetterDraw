import { expect, test } from '@playwright/test'
import { clickWall, newProject, resetDb, setField, SHOTS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Retours 4')
})

test('pas vertical différent du pas horizontal, résumé sur une ligne', async ({ page }) => {
  await page.getByTestId('link-steps').click()
  await setField(page, 'grid-step-y', 40)
  await expect(page.getByTestId('grid-summary')).toHaveText('6 × 7 cases · reste ↕ 10 cm')
  const box = (await page.getByTestId('grid-summary').boundingBox())!
  expect(box.height).toBeLessThan(22) // une seule ligne
  await expect(page.getByTestId('grid-labels').getByText('7', { exact: true })).toHaveCount(1)
  await page.getByTestId('swatch-Bleu canard').click()
  await page.getByTestId('tool-select').click()
  await page.screenshot({ path: `${SHOTS}/step17-01-pas-vertical.png` })
  // re-lier : un seul pas
  await page.getByTestId('link-steps').click()
  await expect(page.getByTestId('grid-step-y')).toHaveCount(0)
  await expect(page.getByTestId('grid-summary')).toHaveText('6 × 5 cases')
})

test('renommer la variante dans l’en-tête et liste des variantes par-dessus l’éditeur', async ({ page }) => {
  await page.getByTestId('variant-name-input').fill('Bleu nuit')
  await page.getByTestId('variant-name-input').press('Enter')
  await page.getByTestId('snapshot').click()
  await expect(page.getByTestId('variant-name-input')).toHaveValue('Variante B')
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 0, 120)
  await clickWall(page, 300, 120)
  await page.keyboard.press('Enter')
  await page.getByTestId('variants-page').click()
  await expect(page.getByTestId('variants-overlay')).toBeVisible()
  await expect(page.getByTestId('variant-card')).toHaveCount(2)
  await expect(page.getByTestId('variant-card').first()).toContainText('Bleu nuit')
  await expect(page.locator('.current-badge')).toHaveCount(1)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOTS}/step17-02-liste-variantes.png` })
  // ouvrir l'autre variante depuis la liste, on reste dans l'éditeur
  await page.getByTestId('variant-card').first().getByRole('button', { name: 'Ouvrir', exact: true }).click()
  await expect(page.getByTestId('variants-overlay')).toHaveCount(0)
  await expect(page.getByTestId('variant-name-input')).toHaveValue('Bleu nuit')
  await expect(page.getByTestId('canvas')).toBeVisible()
  await expect(page.locator('.images-section .hint, [data-testid=images-section] .hint')).toHaveCount(0)
})
