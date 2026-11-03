import { expect, test, type Page } from '@playwright/test'
import { newProject, resetDb, SHOTS } from './helpers'

const QUAD = [[150, 90], [690, 40], [730, 560], [110, 510]] // coins du mur sur la photo (800 × 600)

async function dragQuad(page: Page, i: number, to: number[]) {
  const svg = page.getByTestId('perspective-overlay')
  const box = (await svg.boundingBox())!
  const h = (await page.getByTestId(`quad-${i}`).boundingBox())!
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + (to[0] / 800) * box.width, box.y + (to[1] / 600) * box.height, { steps: 5 })
  if (i === 1) await page.screenshot({ path: `${SHOTS}/step13-01-perspective-loupe.png` })
  await page.mouse.up()
  // le coin est bien arrivé à destination (à 2 px près dans l'image)
  const cx = +(await page.getByTestId(`quad-${i}`).getAttribute('cx'))!
  const cy = +(await page.getByTestId(`quad-${i}`).getAttribute('cy'))!
  expect(Math.abs(cx - to[0])).toBeLessThan(2)
  expect(Math.abs(cy - to[1])).toBeLessThan(2)
}

test('corriger la perspective d’une photo de mur puis la recadrer', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Photo du mur')
  await page.getByTestId('image-input').setInputFiles('e2e/fixtures/mur-perspective.png')
  await expect(page.getByTestId('ref-image')).toHaveCount(1)
  await page.getByTestId('image-adjust').click()
  await expect(page.getByTestId('image-edit-modal')).toBeVisible()
  for (let i = 0; i < 4; i++) await dragQuad(page, i, QUAD[i])
  await page.getByTestId('use-real-size').check()
  await page.getByTestId('real-w').fill('300')
  await page.getByTestId('real-h').fill('200')
  await page.screenshot({ path: `${SHOTS}/step13-02-perspective-coins.png` })

  await page.getByTestId('tab-crop').click()
  await expect(page.getByTestId('crop-frame')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/step13-03-image-redressee.png` })
  await page.getByTestId('crop-to-rect').click()
  await page.screenshot({ path: `${SHOTS}/step13-04-recadrage.png` })
  await page.getByTestId('apply-image-edit').click()
  await expect(page.getByTestId('image-edit-modal')).toHaveCount(0)

  // l'image affiche maintenant le mur redressé, à l'échelle réelle 300 × 200 cm
  const img = page.getByTestId('ref-image')
  await expect.poll(async () => +(await img.getAttribute('width'))!).toBeCloseTo(300, 0)
  expect(+(await img.getAttribute('height'))!).toBeCloseTo(200, 0)

  // vérification des pixels : la fenêtre (bleue) est à sa place dans l'image redressée
  const px = await img.evaluate(async (el) => {
    const href = el.getAttribute('href')!
    const im = new Image()
    im.src = href
    await im.decode()
    const c = document.createElement('canvas')
    c.width = im.naturalWidth
    c.height = im.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(im, 0, 0)
    const at = (u: number, v: number) => [...ctx.getImageData(Math.round((u / 600) * c.width), Math.round((v / 400) * c.height), 1, 1).data]
    return { window: at(440, 170), orange: at(160, 275), wall: at(30, 30), corner: at(3, 3) }
  })
  expect(px.window[2]).toBeGreaterThan(180) // bleu
  expect(px.window[0]).toBeLessThan(150)
  expect(px.orange[0]).toBeGreaterThan(170) // terracotta
  expect(px.orange[2]).toBeLessThan(110)
  expect(px.wall[0]).toBeGreaterThan(200) // mur clair
  await page.getByTestId('tool-image').click()
  await page.getByTestId('image-opacity').focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  await page.screenshot({ path: `${SHOTS}/step13-05-resultat-sur-le-mur.png` })

  // rééditable : on retrouve la photo d'origine et les coins posés
  await page.getByTestId('image-adjust').click()
  await expect(page.getByTestId('real-w')).toHaveValue('300')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('image-edit-modal')).toHaveCount(0)
  // revenir à l'état d'avant l'ajustement via la frise d'historique
  await page.getByTestId('tab-history').click()
  await page.getByTestId('history-item').filter({ hasText: 'Importer l' }).click()
  await expect.poll(async () => Math.round(+(await img.getAttribute('width'))!)).not.toBe(300)
})
