import { expect, test, type Page } from '@playwright/test'
import { clickWall, newProject, openRoomsOnPlan, resetDb } from './helpers'

const fills = (page: Page) => page.getByTestId('fills').locator('path')

async function poly(page: Page, pts: [number, number][], close = false) {
  await page.getByTestId('tool-polyline').click()
  // Alt : sans aimantage
  for (const [x, y] of pts) await clickWall(page, x, y, ['Alt'])
  if (close) await clickWall(page, pts[0][0], pts[0][1], ['Alt'])
  else await page.keyboard.press('Enter')
}

/** Style calculé d'une ligne de grille posée sur le fond du mur. */
const gridLineStyle = (page: Page) =>
  page.locator('[data-grid-on=background] line').first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return { width: cs.strokeWidth, dash: cs.strokeDasharray, color: cs.stroke }
  })

test.describe('mur seul', () => {
  test.beforeEach(async ({ page }) => {
    await resetDb(page)
    await newProject(page, 'Canvas', 300, 250)
  })

  test('un trait qui sort du mur est coupé au bord et la bordure ferme la zone', async ({ page }) => {
    // de 3 cm hors du mur à gauche jusqu'à 4 cm hors du mur à droite
    await poly(page, [[-3, 120], [304, 150]])
    const d = await page.getByTestId('shapes').locator('path').first().getAttribute('d')
    const xs = d!.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 0)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(300)
    // le pot de peinture ne signale aucun trou : la zone au-dessus du trait est fermée
    await page.getByTestId('tool-fill').click()
    await clickWall(page, 150, 40)
    await expect(page.getByTestId('gap-marker')).toHaveCount(0)
    await expect(fills(page)).toHaveCount(1)
  })

  test('la grille a le même trait en Édition et en Consultation', async ({ page }) => {
    const edit = await gridLineStyle(page)
    await page.getByTestId('mode-consult').click()
    await expect(page.getByTestId('consult-panel')).toBeVisible()
    expect(await gridLineStyle(page)).toEqual(edit)
  })

  test('masquer la grille et les réglages ne comptent pas dans l’historique', async ({ page }) => {
    await poly(page, [[100, 0], [100, 250]])
    await page.getByTestId('tab-history').click()
    await expect(page.getByTestId('history-count')).toHaveText('1 modification')
    await page.getByTestId('tab-history').click()
    await page.getByTestId('toggle-grid').click()
    await expect(page.getByTestId('grid-lines')).toHaveCount(0)
    await page.getByTestId('open-settings').click()
    await page.getByTestId('line-style-dotted').click()
    await page.getByTestId('close-settings').click()
    await page.getByTestId('tab-history').click()
    await expect(page.getByTestId('history-count')).toHaveText('1 modification')
    await page.getByTestId('tab-history').click()
    // annuler retire le trait, pas le masquage de la grille
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('shapes').locator('path')).toHaveCount(0)
    await expect(page.getByTestId('grid-lines')).toHaveCount(0)
    // le réglage est enregistré
    await page.reload()
    await page.getByTestId('canvas').waitFor()
    await expect(page.getByTestId('grid-lines')).toHaveCount(0)
    await page.getByTestId('toggle-grid').click()
    await expect(page.getByTestId('grid-lines')).toHaveAttribute('data-line-style', 'dotted')
  })
})

test('murs liés : la jonction reste visible sur une ligne de grille, même dans une zone peinte', async ({ page }) => {
  await resetDb(page)
  await openRoomsOnPlan(page)
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('link-walls').click()
  await page.getByTestId('plan-wall-1').click({ force: true })
  await page.getByTestId('link-confirm').click()
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')
  await page.getByTestId('paint-wall').click()
  // la jonction (x = 400) tombe sur une ligne de la grille de 50 cm ; une zone peinte la traverse
  await poly(page, [[0, 150], [250, 220], [450, 120], [380, 40], [100, 40]], true)
  await page.getByTestId('tool-fill').click()
  await page.getByTestId('swatch-Rose poudré').click()
  await clickWall(page, 200, 150)
  await expect(fills(page)).toHaveCount(1)
  const seam = page.getByTestId('group-seam').locator('line')
  await expect(seam).toHaveAttribute('x1', '400')
  // dessinée après (donc au-dessus de) la grille et de son cache coloré dans les zones peintes
  const above = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid=world] [data-testid=grid-lines]')!
    const line = document.querySelector('[data-testid=group-seam] line')!
    return !!(grid.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING) && !grid.contains(line)
  })
  expect(above).toBe(true)
  const style = await seam.evaluate((el) => ({ dash: getComputedStyle(el).strokeDasharray, opacity: getComputedStyle(el).opacity }))
  expect(style).toEqual({ dash: 'none', opacity: '1' })
})
