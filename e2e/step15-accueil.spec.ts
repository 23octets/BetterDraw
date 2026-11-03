import { expect, test } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS } from './helpers'

test('accueil et page projet : les aperçus tiennent dans les cartes, quelle que soit la forme du mur', async ({ page }) => {
  await resetDb(page)
  for (const [n, w, h] of [['Couloir', 600, 200], ['Chambre de Léa', 300, 250], ['Cage d’escalier', 180, 420]] as [string, number, number][]) {
    await page.goto('/')
    await newProject(page, n, w, h)
    await page.getByTestId('tool-polyline').click()
    await clickWall(page, 0, h * 0.6)
    await clickWall(page, w, h * 0.4)
    await page.keyboard.press('Enter')
    await page.getByTestId('swatch-Terracotta').click()
    await clickWall(page, w / 2, h * 0.9)
    await page.getByTestId('swatch-Bleu canard').click()
    await clickWall(page, w / 2, h * 0.1)
    await page.getByTestId('variants-page').click()
  await page.getByTestId('snapshot').click()
    await page.getByTestId('swatch-Ocre').click()
    await clickWall(page, w / 2, h * 0.1)
  }
  await page.goto('/')
  await expect(page.getByTestId('project-card')).toHaveCount(3)
  // chaque aperçu est contenu dans son cadre
  for (const card of await page.getByTestId('project-card').all()) {
    const frame = (await card.locator('.thumb-frame').boundingBox())!
    const svg = (await card.locator('.thumb-svg').boundingBox())!
    const c = (await card.boundingBox())!
    expect(svg.y).toBeGreaterThanOrEqual(frame.y - 1)
    expect(svg.y + svg.height).toBeLessThanOrEqual(frame.y + frame.height + 1)
    expect(frame.y + frame.height).toBeLessThanOrEqual(c.y + c.height)
  }
  await page.screenshot({ path: `${SHOTS}/step15-01-accueil.png` })
  await page.getByTestId('open-variants').last().click()
  await expect(page.getByTestId('variant-card')).toHaveCount(2)
  for (const card of await page.getByTestId('variant-card').all()) {
    const frame = (await card.locator('.thumb-frame').boundingBox())!
    const svg = (await card.locator('.thumb-svg').boundingBox())!
    expect(svg.y + svg.height).toBeLessThanOrEqual(frame.y + frame.height + 1)
  }
  await page.getByTestId('pick-variant').first().check()
  await page.screenshot({ path: `${SHOTS}/step15-02-page-projet.png` })
})
