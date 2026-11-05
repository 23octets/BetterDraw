import { expect, test } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS } from './helpers'

test('frise d’historique : revenir à n’importe quel état, persistant', { tag: '@essentiel' }, async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Historique')
  await page.getByTestId('tool-polyline').click()
  for (let i = 0; i < 4; i++) {
    await clickWall(page, 30 + i * 60, 40)
    await clickWall(page, 30 + i * 60, 210)
    await page.keyboard.press('Enter')
  }
  await page.getByTestId('swatch-Vert sauge').click()
  await clickWall(page, 60, 100)
  await page.getByTestId('tab-history').click()
  await expect(page.getByTestId('history-count')).toHaveText('5 modifications')
  await expect(page.getByTestId('history-item')).toHaveCount(6)
  await expect(page.getByTestId('history-item').first()).toContainText('Peindre (Vert sauge)')
  // revenir à l'état #2
  await page.getByTestId('history-item').filter({ hasText: '#2' }).click()
  await expect(page.getByTestId('shapes').locator('path')).toHaveCount(2)
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/step5-01-frise-historique.png` })
  // persistant après rechargement
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await page.reload()
  await expect(page.getByTestId('shapes').locator('path')).toHaveCount(2)
  await page.getByTestId('tab-history').click()
  await expect(page.getByTestId('history-count')).toHaveText('5 modifications')
  // curseur jusqu'au bout
  const slider = page.getByTestId('history-slider')
  await slider.focus()
  await page.keyboard.press('End')
  await expect(page.getByTestId('shapes').locator('path')).toHaveCount(4)
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(1)
  // revenir en arrière puis modifier : la suite n'est pas perdue
  await page.getByTestId('history-item').filter({ hasText: '#3' }).click()
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 280, 40)
  await clickWall(page, 280, 210)
  await page.keyboard.press('Enter')
  await page.getByTestId('tab-history').click()
  await expect(page.getByTestId('history-count')).toHaveText('7 modifications')
  await expect(page.getByTestId('history-item').nth(1)).toContainText("Retour à l'état #3")
  await page.screenshot({ path: `${SHOTS}/step5-02-historique-sans-perte.png` })
})
