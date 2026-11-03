import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { clickWall, newProject, resetDb, SHOTS } from './helpers'

async function poly(page: Page, pts: [number, number][], close = false) {
  await page.getByTestId('tool-polyline').click()
  for (const [x, y] of pts) await clickWall(page, x, y)
  if (close) await clickWall(page, pts[0][0], pts[0][1])
  else await page.keyboard.press('Enter')
}

async function drawScene(page: Page) {
  // montagnes, soleil, horizon
  await poly(page, [[0, 170], [300, 170]])
  await poly(page, [[0, 170], [70, 90], [130, 170]])
  await poly(page, [[110, 147], [190, 60], [280, 170]])
  await page.getByTestId('tool-arc').click()
  await clickWall(page, 190, 170)
  await clickWall(page, 280, 170)
  await clickWall(page, 235, 125)
  await page.getByTestId('swatch-Rose poudré').click()
  await clickWall(page, 20, 20)
  await page.getByTestId('swatch-Vert sauge').click()
  await clickWall(page, 60, 150)
  await page.getByTestId('swatch-Bleu canard').click()
  await clickWall(page, 170, 120)
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 235, 160)
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 150, 220)
}

test('mode consultation : zoom case par case et choix des cases à imprimer', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Fresque')
  await drawScene(page)
  await page.getByTestId('mode-consult').click()
  await expect(page.getByTestId('consult-panel')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/step8-01-consultation-ensemble.png` })
  await clickWall(page, 180, 80) // case D4 (origine bas-gauche)
  await expect(page.getByTestId('consult-cell')).toHaveText('D4')
  await expect(page.getByTestId('consult-overlay')).toContainText('↔ 150 cm')
  await expect(page.getByTestId('consult-overlay')).toContainText('↕ 200 cm')
  await page.screenshot({ path: `${SHOTS}/step8-02-consultation-case-D4.png` })
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('consult-cell')).toHaveText('E4')
  await page.getByTestId('toggle-current-print').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('consult-cell')).toHaveText('Vue d’ensemble')
  await page.getByTestId('pick-print').check()
  await clickWall(page, 180, 80)
  await clickWall(page, 60, 120)
  await expect(page.getByTestId('print-cells').locator('button')).toHaveText(['E4', 'D4', 'B3'])
  await expect(page.getByTestId('print-cell')).toHaveCount(3)
})

test('export PDF chantier, PNG, SVG et sauvegarde JSON réimportable', async ({ page }) => {
  await resetDb(page)
  await newProject(page, 'Fresque')
  await drawScene(page)
  await page.getByTestId('export').click()
  await expect(page.getByTestId('page-preview')).toHaveCount(1)
  await page.getByTestId('pick-D4').click()
  await page.getByTestId('pick-B3').click()
  await expect(page.getByTestId('page-preview')).toHaveCount(3)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${SHOTS}/step8-03-export-apercu.png` })

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()])
  expect(pdf.suggestedFilename()).toBe('fresque-variante-a-chantier.pdf')
  const pdfPath = `${SHOTS}/../exemple-chantier.pdf`
  await pdf.saveAs(pdfPath)
  const bytes = readFileSync(pdfPath).toString('latin1')
  expect(bytes.startsWith('%PDF')).toBe(true)
  expect((bytes.match(/\/Type \/Page\b/g) ?? []).length).toBe(3)

  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()])
  expect(png.suggestedFilename()).toBe('fresque-variante-a.png')
  await png.saveAs(`${SHOTS}/step8-05-export.png`)
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-svg').click()])
  expect(svg.suggestedFilename()).toBe('fresque-variante-a.svg')

  const [json] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()])
  const jsonPath = 'test-results/fresque.betterdraw.json'
  await json.saveAs(jsonPath)
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
  expect(data.format).toBe('betterdraw-project')

  // réimport sur l'accueil
  await page.keyboard.press('Escape')
  await page.goto('/')
  await page.getByTestId('import-project').setInputFiles(jsonPath)
  await expect(page.getByTestId('import-msg')).toContainText('importé')
  await expect(page.getByTestId('project-card')).toHaveCount(2)
  await page.screenshot({ path: `${SHOTS}/step8-06-accueil-import.png` })
})
