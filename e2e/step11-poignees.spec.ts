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

test('un sommet entre une courbe de Bézier et un arc a une poignée de chaque côté', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Poignées 2')
  await page.getByTestId('tool-bezier').click()
  const pt = (x: number, y: number) => wallToPage(page, x, y)
  const a = await pt(40, 180)
  await page.mouse.click(a.x, a.y)
  const b = await pt(120, 120), b2 = await pt(150, 120)
  await page.mouse.move(b.x, b.y)
  await page.mouse.down()
  await page.mouse.move(b2.x, b2.y, { steps: 4 })
  await page.mouse.up()
  const c = await pt(250, 150)
  await page.mouse.click(c.x, c.y)
  await page.keyboard.press('Enter')
  await page.getByTestId('tool-select').click()
  await page.mouse.move(a.x + 20, a.y + 20)
  await page.mouse.move(a.x, a.y, { steps: 3 })
  // le 2e segment (Bézier) → arc, en glissant son rond
  const mid = page.getByTestId('handle-mid').nth(1)
  const mb = (await mid.boundingBox())!
  const to = await pt(185, 105)
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  const path = page.getByTestId('shapes').locator('path').first()
  await expect(path).toHaveAttribute('d', /A/)
  // le sommet du milieu garde une poignée côté Bézier ET côté arc
  await expect(page.locator('[data-testid=handle-ctrl].virtual')).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/step11-03-poignees-deux-cotes.png` })
  // tirer la poignée côté arc : le segment devient une courbe de Bézier
  const v = (await page.locator('[data-testid=handle-ctrl].virtual').boundingBox())!
  const to2 = await pt(175, 90)
  await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2)
  await page.mouse.down()
  await page.mouse.move(to2.x, to2.y, { steps: 6 })
  await page.mouse.up()
  await expect(path).not.toHaveAttribute('d', /A/)
})
