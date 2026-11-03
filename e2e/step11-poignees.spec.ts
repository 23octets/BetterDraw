import { expect, test } from '@playwright/test'
import { clickWall, newProject, resetDb, SHOTS, wallToPage } from './helpers'

test('points visibles au survol, courbe de Bézier transformée en arc', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Poignées')
  // une courbe de Bézier (cliquer-glisser au milieu)
  await page.getByTestId('tool-bezier').click()
  await clickWall(page, 40, 150)
  const b = await wallToPage(page, 150, 150)
  const b2 = await wallToPage(page, 190, 150)
  await page.mouse.move(b.x, b.y)
  await page.mouse.down()
  await page.mouse.move(b2.x, b2.y, { steps: 4 })
  await page.mouse.up()
  await clickWall(page, 260, 150)
  await page.keyboard.press('Enter')
  const path = page.getByTestId('shapes').locator('path').first()
  await expect(path).toHaveAttribute('d', /C/)

  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('handle-vertex')).toHaveCount(0)
  // survol : les points apparaissent sans cliquer
  const over = await wallToPage(page, 40.5, 150)
  await page.mouse.move(over.x + 30, over.y + 30)
  await page.mouse.move(over.x, over.y, { steps: 3 })
  await expect(page.getByTestId('handle-vertex')).toHaveCount(3)
  await expect(page.getByTestId('handle-mid')).toHaveCount(2)
  await page.screenshot({ path: `${SHOTS}/step11-01-points-au-survol.png` })

  // glisser le rond du milieu du 1er segment (Bézier) : il devient un arc de cercle
  const mid = page.getByTestId('handle-mid').first()
  const box = (await mid.boundingBox())!
  const to = await wallToPage(page, 95, 110)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await expect(path).toHaveAttribute('d', /^M40 150A/)
  await page.screenshot({ path: `${SHOTS}/step11-02-bezier-en-arc.png` })
})
