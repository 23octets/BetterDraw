import { expect, test, type Page } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS, wallToPage } from './helpers'

const shapes = (page: Page) => page.getByTestId('shapes').locator('path')

async function drawRect(page: Page, x: number, y: number, w: number, h: number) {
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, x, y)
  await clickWall(page, x + w, y)
  await clickWall(page, x + w, y + h)
  await clickWall(page, x, y + h)
  await clickWall(page, x, y)
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await wallToPage(page, from.x, from.y)
  const b = await wallToPage(page, to.x, to.y)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Édition')
})

test('sélectionner, courber un segment en arc, déplacer un point', async ({ page }) => {
  await drawRect(page, 50, 50, 100, 100)
  await page.getByTestId('tool-select').click()
  await clickWall(page, 100, 50)
  await expect(page.getByTestId('selection-section')).toBeVisible()
  await expect(page.getByTestId('handle-vertex')).toHaveCount(4)
  // courber le haut du carré
  await drag(page, { x: 100, y: 50 }, { x: 100, y: 25 })
  await expect(shapes(page).first()).toHaveAttribute('d', /A/)
  // déplacer un sommet (aimanté sur la grille fine)
  await drag(page, { x: 150, y: 150 }, { x: 181, y: 171 })
  await expect(shapes(page).first()).toHaveAttribute('d', /L180 170/)
  await page.screenshot({ path: `${SHOTS}/step3-01-edition-poignees.png` })
  // annuler revient au point d'origine
  await page.keyboard.press('Meta+z')
  await expect(shapes(page).first()).toHaveAttribute('d', /L150 150/)
})

test('déplacer, dupliquer, symétrie, rotation, supprimer', async ({ page }) => {
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 40, 200)
  await clickWall(page, 100, 200)
  await clickWall(page, 100, 120)
  await page.keyboard.press('Enter')
  await page.getByTestId('tool-select').click()
  await clickWall(page, 70, 200)
  await drag(page, { x: 55, y: 200 }, { x: 75, y: 180 })
  await expect(shapes(page).first()).toHaveAttribute('d', 'M60 180L120 180L120 100')
  await page.getByTestId('duplicate').click()
  await expect(shapes(page)).toHaveCount(2)
  await page.getByTestId('mirror-h').click()
  await expect(shapes(page).nth(1)).toHaveAttribute('d', 'M130 190L70 190L70 110')
  await page.getByTestId('rotate-90').click()
  await page.screenshot({ path: `${SHOTS}/step3-02-transformations.png` })
  await page.keyboard.press('Delete')
  await expect(shapes(page)).toHaveCount(1)
  // copier / coller
  await clickWall(page, 90, 180)
  await page.keyboard.press('Meta+c')
  await page.keyboard.press('Meta+v')
  await expect(shapes(page)).toHaveCount(2)
  await expect(shapes(page).nth(1)).toHaveAttribute('d', 'M70 190L130 190L130 110')
})

test('sélection par rectangle', async ({ page }) => {
  await drawRect(page, 20, 20, 40, 40)
  await drawRect(page, 100, 20, 40, 40)
  await drawRect(page, 200, 150, 40, 40)
  await page.getByTestId('tool-select').click()
  await drag(page, { x: 10, y: 10 }, { x: 150, y: 80 })
  await expect(page.getByTestId('selected-shape')).toHaveCount(2)
  await expect(page.getByTestId('selection-section')).toContainText('Sélection (2)')
})
