import { expect, test } from '@playwright/test'
import { clickWall, resetDb } from './helpers'

test('guide accessible et refermable à l’accueil et dans l’éditeur', async ({ page }) => {
  await resetDb(page)
  for (const editor of [false, true]) {
    if (editor) await page.getByRole('button', { name: 'Créer un projet exemple' }).click()
    await page.getByText('Guide en 5 étapes', { exact: true }).click()
    await expect(page.getByTestId('guide')).toBeVisible()
    await expect(page.getByTestId('guide').locator('li')).toHaveCount(5)
    await page.screenshot({ path: `test-results/guide-${editor ? 'editeur' : 'accueil'}.png` })
    await expect(page.getByTestId('guide')).toContainText('pas des patrons à l’échelle 1:1')
    if (editor) {
      // Le guide reste ouvert pendant que l’utilisateur suit l’étape de peinture.
      await page.getByTestId('swatch-Ocre').click()
      await expect(page.getByTestId('tool-fill')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('guide')).toBeVisible()
    }
    await page.getByRole('button', { name: 'Fermer le guide' }).click()
    await expect(page.getByTestId('guide')).toBeHidden()
  }
})

test('exemple persistant, modifiable, exportable et supprimable', async ({ page }) => {
  await resetDb(page)
  await expect(page.getByTestId('project-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Créer un projet exemple' }).click()
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(4)
  await page.screenshot({ path: 'test-results/projet-exemple.png' })
  await page.getByTestId('swatch-Rose poudré').click()
  await clickWall(page, 30, 30)
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(5)
  await page.getByTestId('export').click()
  await expect(page.getByTestId('page-preview')).toHaveCount(3)
  const download = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  expect((await download).suggestedFilename()).toMatch(/chantier.pdf$/)
  await page.goto('/')
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  await page.reload()
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Supprimer Exemple — Paysage géométrique' }).click()
  await expect(page.getByTestId('project-card')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('project-card')).toHaveCount(0)
})
