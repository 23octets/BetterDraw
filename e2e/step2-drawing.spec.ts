import { expect, test } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS, wallToPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Dessin')
})

const shapes = (page: import('@playwright/test').Page) => page.getByTestId('shapes').locator('path')

test('polyligne avec arc tangent, fermée sur le premier point', { tag: '@essentiel' }, async ({ page }) => {
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 50, 200)
  await clickWall(page, 150, 200)
  await page.keyboard.press('a')
  await clickWall(page, 200, 150)
  await page.keyboard.press('a')
  await clickWall(page, 200, 100)
  await clickWall(page, 50, 100)
  const p = await wallToPage(page, 120, 60)
  await page.mouse.move(p.x, p.y)
  await page.screenshot({ path: `${SHOTS}/step2-01-polyligne-en-cours.png` })
  await clickWall(page, 50, 200)
  await expect(shapes(page)).toHaveCount(1)
  const d = await shapes(page).first().getAttribute('d')
  expect(d).toContain('A') // segment en arc
  expect(d).toMatch(/Z$/)
})

test('saisie numérique de longueur', async ({ page }) => {
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 20, 220)
  const p = await wallToPage(page, 200, 220)
  await page.mouse.move(p.x, p.y)
  await page.keyboard.type('120')
  await expect(page.getByTestId('numeric-input')).toContainText('120')
  await page.keyboard.press('Enter')
  await page.keyboard.type('80<90')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(shapes(page)).toHaveCount(1)
  await expect(shapes(page).first()).toHaveAttribute('d', 'M20 220L140 220L140 140')
})

test('arc 3 points, courbe de Bézier et mesure', async ({ page }) => {
  await page.getByTestId('tool-arc').click()
  await clickWall(page, 50, 150)
  await clickWall(page, 250, 150)
  await clickWall(page, 150, 60)
  await expect(shapes(page)).toHaveCount(1)
  await expect(shapes(page).first()).toHaveAttribute('d', /^M50 150A/)

  await page.getByTestId('tool-bezier').click()
  const a = await wallToPage(page, 30, 230)
  const b = await wallToPage(page, 150, 200)
  const b2 = await wallToPage(page, 190, 200)
  const c = await wallToPage(page, 270, 230)
  await page.mouse.click(a.x, a.y)
  await page.mouse.move(b.x, b.y)
  await page.mouse.down()
  await page.mouse.move(b2.x, b2.y, { steps: 4 })
  await page.mouse.up()
  await page.mouse.click(c.x, c.y)
  await page.keyboard.press('Enter')
  await expect(shapes(page)).toHaveCount(2)
  await expect(shapes(page).nth(1)).toHaveAttribute('d', /C/)

  await page.getByTestId('tool-measure').click()
  await clickWall(page, 50, 150)
  await clickWall(page, 250, 150)
  await expect(page.getByTestId('measure-label')).toHaveText('200 cm')
  await expect(page.getByTestId('measure-distance')).toHaveText('200 cm')
  await expect(page.getByTestId('measure-dx')).toHaveText('200 cm')
  await page.screenshot({ path: `${SHOTS}/step2-02-arc-bezier-mesure.png` })

  // persistance après rechargement
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await page.reload()
  await expect(shapes(page)).toHaveCount(2)
})

test('aimantage sur les extrémités', async ({ page }) => {
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 100, 100)
  await clickWall(page, 200, 100)
  await page.keyboard.press('Enter')
  await clickWall(page, 150, 30)
  const near = await wallToPage(page, 201.5, 101.5)
  await page.mouse.move(near.x, near.y)
  await expect(page.getByTestId('snap-marker')).toHaveAttribute('data-kind', 'extrémité')
  await page.mouse.click(near.x, near.y)
  await page.keyboard.press('Enter')
  await expect(shapes(page).nth(1)).toHaveAttribute('d', 'M150 30L200 100')
})
