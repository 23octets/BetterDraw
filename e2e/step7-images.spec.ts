import { expect, test } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS, wallToPage } from './helpers'

test('images en filigrane : importer, déplacer, agrandir, opacité, non exportées', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Décalque')
  await page.getByTestId('image-input').setInputFiles('e2e/fixtures/croquis.png')
  await expect(page.getByTestId('ref-image')).toHaveCount(1)
  await expect(page.getByTestId('image-corner')).toHaveCount(4)
  const img = page.getByTestId('ref-image')
  const w0 = +(await img.getAttribute('width'))!
  // agrandir par le coin bas-droit
  const im = { x: +(await img.getAttribute('x'))!, y: +(await img.getAttribute('y'))!, w: w0, h: +(await img.getAttribute('height'))! }
  const c = await wallToPage(page, im.x + im.w, im.y + im.h)
  const t = await wallToPage(page, im.x + im.w + 20, im.y + im.h + 15)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(t.x, t.y, { steps: 5 })
  await page.mouse.up()
  const w1 = +(await img.getAttribute('width'))!
  const h1 = +(await img.getAttribute('height'))!
  expect(w1).toBeGreaterThan(w0)
  expect(h1 / w1).toBeCloseTo(im.h / im.w, 3)
  // déplacer
  const a = await wallToPage(page, 150, 125)
  const b = await wallToPage(page, 140, 115)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await page.mouse.up()
  // opacité
  const slider = page.getByTestId('image-opacity')
  await slider.focus()
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('images-section')).toContainText('Opacité 30 %')
  // dessiner par-dessus
  await page.getByTestId('tool-arc').click()
  await clickWall(page, 90, 150)
  await clickWall(page, 210, 150)
  await clickWall(page, 150, 90)
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 0, 150)
  await clickWall(page, 300, 150)
  await page.keyboard.press('Enter')
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 150, 130)
  await page.getByTestId('swatch-Vert sauge').click()
  await clickWall(page, 40, 200)
  await page.getByTestId('tool-image').click()
  await page.screenshot({ path: `${SHOTS}/step7-01-image-filigrane.png` })
  // invisible en mode rendu, persistée après rechargement
  await page.getByTestId('mode-render').click()
  await expect(page.getByTestId('ref-image')).toHaveCount(0)
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')
  await page.reload()
  await expect(page.getByTestId('ref-image')).toHaveCount(1)
  await expect(page.getByTestId('ref-image')).toHaveAttribute('opacity', '0.3')
})
