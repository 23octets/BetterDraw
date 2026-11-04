import { expect, test, type Page } from '@playwright/test'
import { clickWall, newProject, resetDb, setField } from './helpers'

/**
 * Régression visuelle : ces tests ne tournent qu'en CI, car les images de référence
 * (e2e/__screenshots__) dépendent du rendu Linux. Voir le README pour les mettre à jour.
 */

async function poly(page: Page, pts: [number, number][]) {
  await page.getByTestId('tool-polyline').click()
  for (const [x, y] of pts) await clickWall(page, x, y)
  await page.keyboard.press('Enter')
}

/** Éloigne la souris pour ne pas capturer d'état de survol. */
const parkMouse = (page: Page) => page.mouse.move(0, 0)

/** Les textures sont produites en arrière-plan : tous les murs peints doivent avoir la leur. */
const paintedWallsReady = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as {
      __roomScene?: {
        lastPaints: ({ doc?: unknown } | undefined)[]
        walls: { seg: { index: number }; innerMat: { map: unknown } }[]
      }
    }).__roomScene
    if (!s) return false
    const painted = s.walls.filter((w) => s.lastPaints[w.seg.index]?.doc)
    return painted.length > 0 && painted.every((w) => w.innerMat.map)
  })

test.beforeEach(async ({ page }) => {
  await resetDb(page)
})

test('dessin peint : édition puis consultation', async ({ page }) => {
  await newProject(page, 'Visuel')
  await poly(page, [[0, 170], [300, 170]])
  await poly(page, [[0, 170], [70, 90], [130, 170]])
  await page.getByTestId('tool-arc').click()
  await clickWall(page, 170, 170)
  await clickWall(page, 270, 170)
  await clickWall(page, 220, 120)
  await page.getByTestId('swatch-Rose poudré').click()
  await clickWall(page, 20, 20)
  await page.getByTestId('swatch-Vert sauge').click()
  await clickWall(page, 60, 150)
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 220, 160)
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 150, 220)
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(4)

  await parkMouse(page)
  await expect(page.getByTestId('canvas')).toHaveScreenshot('dessin-edition.png')

  await page.getByTestId('mode-consult').click()
  await expect(page.getByTestId('consult-panel')).toBeVisible()
  await parkMouse(page)
  await expect(page.getByTestId('canvas')).toHaveScreenshot('dessin-consultation.png')
})

test('pièce : plan et vue 3D avec murs peints', async ({ page }) => {
  await page.getByTestId('kind-room').click()
  await page.locator('input[name=name]').fill('Visuel')
  await page.locator('input[name=room-w]').fill('400')
  await page.locator('input[name=room-d]').fill('320')
  await page.locator('input[name=room-h]').fill('250')
  await page.getByRole('button', { name: 'Créer le projet' }).click()

  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('add-window').click()
  await setField(page, 'opening-w', 140)
  await page.getByTestId('plan-wall-3').click({ force: true })
  await page.getByTestId('add-door').click()
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')

  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('paint-wall').click()
  await poly(page, [[0, 160], [400, 160]])
  await page.getByTestId('tool-fill').click()
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 30, 200)
  await page.getByTestId('swatch-Vert sauge').click()
  await clickWall(page, 30, 40)
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(2)

  await page.getByTestId('back-to-room').click()
  await expect(page.getByTestId('room-3d-canvas')).toBeVisible()
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')
  await parkMouse(page)
  await expect(page.getByTestId('plan')).toHaveScreenshot('piece-plan.png')

  await page.getByTestId('layout-3d').click()
  await expect.poll(() => paintedWallsReady(page)).toBe(true)
  await parkMouse(page)
  await expect(page.getByTestId('room-3d')).toHaveScreenshot('piece-3d.png', { timeout: 30_000 })
})
