import { expect, test, type Page } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS, wallToPage } from './helpers'

const fills = (page: Page) => page.getByTestId('fills').locator('path')

async function poly(page: Page, pts: [number, number][], close = false) {
  await page.getByTestId('tool-polyline').click()
  for (const [x, y] of pts) await clickWall(page, x, y)
  if (close) await clickWall(page, pts[0][0], pts[0][1])
  else await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Peinture')
})

test('peindre des zones, surfaces et litres, mode rendu', async ({ page }) => {
  // un soleil couchant : horizon + demi-disque + rayons
  await poly(page, [[0, 170], [300, 170]])
  await page.getByTestId('tool-arc').click()
  await clickWall(page, 90, 170)
  await clickWall(page, 210, 170)
  await clickWall(page, 150, 110)
  await poly(page, [[150, 110], [150, 30]])
  await poly(page, [[90, 115], [40, 60]])
  await poly(page, [[210, 115], [260, 60]])
  // rayons pendants : ils ne découpent pas le ciel
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 150, 150)
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 50, 200)
  await page.getByTestId('swatch-Rose poudré').click()
  await clickWall(page, 20, 20)
  await expect(fills(page)).toHaveCount(3)
  await expect(page.getByTestId('surface-row')).toHaveCount(3)
  // sol : 300 × 80 = 2.40 m²
  await expect(page.getByTestId('surfaces-table')).toContainText('2.40 m²')
  await page.screenshot({ path: `${SHOTS}/step4-01-peinture-edition.png` })
  await page.getByTestId('mode-render').click()
  await expect(page.getByTestId('shapes')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/step4-02-mode-rendu.png` })
  await page.getByTestId('mode-edit').click()

  // pipette puis gomme
  await page.getByTestId('tool-pick').click()
  await clickWall(page, 50, 200)
  await expect(page.getByTestId('flash')).toContainText('Terracotta')
  await page.getByTestId('tool-erase').click()
  await clickWall(page, 50, 200)
  await expect(fills(page)).toHaveCount(2)
})

test('une zone mal fermée est refusée et le trou signalé', async ({ page }) => {
  await poly(page, [[52, 50], [150, 50], [150, 150], [50, 150], [50, 54]])
  await page.getByTestId('tool-fill').click()
  await clickWall(page, 100, 100)
  await expect(page.getByTestId('flash')).toContainText('Zone mal fermée')
  await expect(page.getByTestId('gap-marker')).toHaveCount(1)
  await expect(fills(page)).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/step4-03-zone-mal-fermee.png` })
  // Alt+clic : on peint quand même
  await clickWall(page, 100, 100, ['Alt'])
  await expect(fills(page)).toHaveCount(1)
})

test('la couleur suit la zone quand on déplace un trait', async ({ page }) => {
  await poly(page, [[100, 0], [100, 250]])
  await page.getByTestId('swatch-Bleu canard').click()
  await clickWall(page, 50, 100)
  await expect(fills(page).first()).toHaveAttribute('data-area', '25000')
  await page.getByTestId('tool-select').click()
  await clickWall(page, 100, 60)
  const a = await wallToPage(page, 100, 60)
  const b = await wallToPage(page, 150, 60)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
  await expect(fills(page).first()).toHaveAttribute('data-area', '37500')
})
