import { expect, test, type Page } from '@playwright/test'
import { clickWall, resetDb, setField, SHOTS, wallToPage } from './helpers'

async function poly(page: Page, pts: [number, number][]) {
  await page.getByTestId('tool-polyline').click()
  for (const [x, y] of pts) await clickWall(page, x, y)
  await page.keyboard.press('Enter')
}

/** Nombre de murs dont la peinture est appliquée en texture dans la scène 3D. */
const texturedWalls = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __roomScene?: { walls: { innerMat: { map: unknown } }[] } }).__roomScene
    return s ? s.walls.filter((w) => w.innerMat.map).length : -1
  })

test.beforeEach(async ({ page }) => {
  await resetDb(page)
})

test('pièce : plan, portes et fenêtres, peinture des murs, vue 3D', async ({ page }) => {
  await page.getByTestId('kind-room').click()
  await page.locator('input[name=name]').fill('Chambre de Léa')
  await page.locator('input[name=room-w]').fill('400')
  await page.locator('input[name=room-d]').fill('320')
  await page.locator('input[name=room-h]').fill('250')
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await expect(page.getByTestId('plan')).toBeVisible()
  await expect(page.getByTestId('room-wall-item')).toHaveCount(4)
  await expect(page.getByTestId('room-stats')).toContainText('12.80 m²')

  // une fenêtre sur le mur 1, une porte sur le mur 4
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('add-window').click()
  await setField(page, 'opening-w', 140)
  await expect(page.getByTestId('opening-window')).toContainText('140 × 125 cm')
  await page.getByTestId('plan-wall-3').click({ force: true })
  await page.getByTestId('add-door').click()
  await expect(page.getByTestId('plan-opening-door')).toBeVisible()
  await expect(page.getByTestId('plan-opening-window')).toBeVisible()
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')

  // peindre le mur 1 : la fenêtre apparaît sur le dessin
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('paint-wall').click()
  await expect(page.getByTestId('wall-title')).toHaveText('Mur 1')
  await expect(page.getByTestId('openings-layer').locator('.opening-overlay')).toHaveCount(1)
  await poly(page, [[0, 160], [400, 160]])
  await page.getByTestId('tool-fill').click()
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 30, 200)
  await page.getByTestId('swatch-Vert sauge').click()
  await clickWall(page, 30, 40)
  await expect(page.getByTestId('fills').locator('path')).toHaveCount(2)
  await page.screenshot({ path: `${SHOTS}/step19-02-mur-fenetre.png` })

  // mur suivant : réglages de taille verrouillés par le plan
  await page.getByTestId('next-wall').click()
  await expect(page.getByTestId('wall-title')).toHaveText('Mur 2')
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('wall-size-locked')).toContainText('320 × 250 cm')
  await page.getByTestId('close-settings').click()
  await poly(page, [[0, 250], [320, 0]])
  await page.getByTestId('tool-fill').click()
  await page.getByTestId('swatch-Bleu canard').click()
  await clickWall(page, 40, 200)
  await page.getByTestId('swatch-Ocre').click()
  await clickWall(page, 280, 40)

  // retour à la pièce : la 3D montre les murs peints
  await page.getByTestId('back-to-room').click()
  await expect(page.getByTestId('room-3d-canvas')).toBeVisible()
  await expect.poll(() => texturedWalls(page)).toBe(4)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/step19-01-piece-plan-3d.png` })
  await page.getByTestId('layout-3d').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/step19-03-piece-3d.png` })
  await page.getByTestId('layout-split').click()

  // allonger le mur 1 : le dessin suit, puis annuler
  await page.getByTestId('plan-wall-0').click({ force: true })
  await setField(page, 'wall-length', 450)
  await expect(page.getByTestId('plan-label-0')).toContainText('450 cm')
  await expect(page.getByTestId('plan-label-2')).toContainText('450 cm')
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')
  await page.getByTestId('paint-wall').click()
  await expect(page.getByTestId('wall')).toHaveAttribute('width', '450')
  await page.getByTestId('back-to-room').click()
  await page.getByTestId('room-undo').click()
  await expect(page.getByTestId('plan-label-0')).toContainText('400 cm')

  // ajouter un angle (double-clic sur un mur) puis le supprimer
  await page.getByTestId('plan-wall-1').dblclick({ force: true })
  await expect(page.getByTestId('corner-panel')).toBeVisible()
  await expect(page.getByTestId('room-wall-item')).toHaveCount(0)
  await expect(page.locator('[data-testid^=plan-corner-]')).toHaveCount(5)
  await page.getByTestId('remove-corner').click()
  await expect(page.locator('[data-testid^=plan-corner-]')).toHaveCount(4)

  // déplacer un angle à la souris : la pièce devient un trapèze
  const c = (await page.getByTestId('plan-corner-2').boundingBox())!
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
  await page.mouse.down()
  await page.mouse.move(c.x + 60, c.y + 40, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByTestId('plan-label-1')).not.toContainText('320 cm')
  await page.getByTestId('room-undo').click()
  await expect(page.getByTestId('plan-label-1')).toContainText('320 cm')

  // la séparation entre le plan et la 3D se déplace
  const plan0 = (await page.getByTestId('plan').boundingBox())!.width
  const sp = (await page.getByTestId('room-splitter').boundingBox())!
  await page.mouse.move(sp.x + sp.width / 2, sp.y + sp.height / 2)
  await page.mouse.down()
  await page.mouse.move(sp.x - 150, sp.y + sp.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => Math.round((await page.getByTestId('plan').boundingBox())!.width)).toBeLessThan(plan0 - 100)
  await page.getByTestId('room-splitter').dblclick()
  await expect.poll(async () => Math.round((await page.getByTestId('plan').boundingBox())!.width)).toBe(Math.round(plan0))

  // visite : on peut passer en mode première personne
  await page.getByTestId('mode-walk').click()
  await expect(page.getByTestId('mode-walk')).toHaveClass(/on/)
  // comme Échap pour un utilisateur : tant que le pointeur est verrouillé, un clic n'atteint pas les boutons
  await page.evaluate(() => document.exitPointerLock())
  await page.getByTestId('mode-orbit').click()

  // l'accueil affiche la pièce
  await page.getByRole('button', { name: 'Projets' }).click()
  await expect(page.getByTestId('project-card')).toContainText('Pièce · 4 murs')
  await page.screenshot({ path: `${SHOTS}/step19-04-accueil.png` })
})

test('transformer un mur seul en pièce', async ({ page }) => {
  await page.getByTestId('new-project-form').locator('input[name=name]').fill('Salon')
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await page.getByTestId('canvas').waitFor()
  await page.getByRole('button', { name: 'Projets' }).click()
  await page.getByTestId('convert-room').click()
  await expect(page.getByTestId('plan')).toBeVisible()
  await expect(page.getByTestId('room-wall-item')).toHaveCount(4)
  await expect(page.getByTestId('plan-label-0')).toContainText('300 cm')
})

test('pièce en L, porte et fenêtre posées au clic sur le plan, décroché', async ({ page }) => {
  await page.getByTestId('kind-room').click()
  await page.getByTestId('shape-L').click()
  await page.locator('input[name=name]').fill('Séjour')
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await expect(page.getByTestId('room-wall-item')).toHaveCount(6)
  await expect(page.getByTestId('room-stats')).toContainText('9.60 m²')

  // outil Porte : clic sur le mur 1, la porte est centrée sur le point visé
  await page.getByTestId('tool-door').click()
  const w0 = (await page.getByTestId('plan-wall-0').boundingBox())!
  await page.mouse.move(w0.x + w0.width / 2, w0.y + w0.height / 2)
  await expect(page.getByTestId('plan-ghost')).toBeVisible()
  await expect(page.getByTestId('placing-tip')).toBeVisible()
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByTestId('plan-opening-door')).toBeVisible()
  await expect(page.getByTestId('placing-tip')).toHaveCount(0)
  await expect(page.getByTestId('opening-door')).toBeVisible()

  // outil Fenêtre sur le dernier mur (gauche)
  await page.getByTestId('tool-window').click()
  const w5 = (await page.getByTestId('plan-wall-5').boundingBox())!
  await page.mouse.click(w5.x + w5.width / 2, w5.y + w5.height / 2)
  await expect(page.getByTestId('plan-opening-window')).toBeVisible()
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')
  await page.screenshot({ path: `${SHOTS}/step19-05-piece-en-L.png` })

  // décroché supplémentaire : 8 murs
  await page.keyboard.press('Escape')
  await page.getByTestId('tool-notch').click()
  await expect(page.locator('[data-testid^=plan-corner-]')).toHaveCount(8)
  await expect(page.getByTestId('corner-panel')).toBeVisible()
  await page.getByTestId('room-undo').click()
  await expect(page.locator('[data-testid^=plan-corner-]')).toHaveCount(6)
})

test('verrouiller un mur, choisir le sens d’agrandissement, carreaux et soubassement vitré', async ({ page }) => {
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await expect(page.getByTestId('room-wall-item')).toHaveCount(4)

  // mur 1 : s'allonge à gauche (le coin de droite reste fixe)
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('grow-left').click()
  await expect(page.getByTestId('plan-grow-left')).toBeVisible()
  await expect(page.getByTestId('plan-grow-right')).toHaveCount(0)
  await setField(page, 'wall-length', 450)
  await expect(page.getByTestId('plan-label-0')).toContainText('450 cm')
  await page.getByTestId('plan-corner-1').click({ force: true })
  await expect(page.getByTestId('corner-x')).toHaveValue('400')
  await page.getByTestId('plan-corner-0').click({ force: true })
  await expect(page.getByTestId('corner-x')).toHaveValue('-50')

  // verrouiller le mur 2 : déplacer son angle le translate en entier
  await page.keyboard.press('Escape')
  await page.getByTestId('lock-wall-1').click()
  await expect(page.getByTestId('plan-lock-1')).toBeVisible()
  await page.getByTestId('plan-corner-1').click({ force: true })
  await setField(page, 'corner-x', 430)
  await expect(page.getByTestId('plan-label-1')).toContainText('320 cm')
  await expect(page.getByTestId('plan-label-0')).toContainText('480 cm')
  await page.getByTestId('plan-wall-1').click({ force: true })
  await expect(page.getByTestId('wall-length')).toBeDisabled()

  // fenêtre 3 × 2 carreaux avec soubassement vitré
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('add-window').click()
  await setField(page, 'opening-cols', 3)
  await setField(page, 'opening-rows', 2)
  await page.getByTestId('opening-base-toggle').check()
  await expect(page.getByTestId('opening-sill')).toHaveValue('0')
  await expect(page.getByTestId('opening-base')).toHaveValue('95')
  await expect(page.getByTestId('opening-window')).toContainText('120 × 220 cm')
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/step19-06-verrou-fenetre.png` })
  await page.getByTestId('paint-wall').click()
  await expect(page.getByTestId('openings-layer').locator('.opening-bar')).toHaveCount(4)
})

test('lier des murs : un seul dessin continu sur plusieurs murs', async ({ page }) => {
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await expect(page.getByTestId('room-wall-item')).toHaveCount(4)

  // le mur 1 a déjà un dessin : il est recopié dans le dessin commun
  await page.getByTestId('paint-wall-0').click()
  await poly(page, [[0, 125], [400, 125]])
  await page.getByTestId('back-to-room').click()

  // lier les murs 1 et 2 (clic sur le plan)
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('link-walls').click()
  await expect(page.getByTestId('link-panel')).toBeVisible()
  await page.getByTestId('plan-wall-1').click({ force: true })
  await expect(page.getByTestId('link-check-1')).toBeChecked()
  await expect(page.getByTestId('link-preview')).toContainText('720 × 250')
  await page.getByTestId('link-confirm').click()
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')
  await expect(page.getByTestId('plan-linked-0')).toHaveCount(1)
  await expect(page.getByTestId('plan-linked-1')).toHaveCount(1)
  await expect(page.getByTestId('link-box')).toContainText('Mur 2')

  // un seul dessin de 720 cm : le trait du mur 1 est là, jonction marquée
  await page.getByTestId('paint-wall').click()
  await expect(page.getByTestId('wall')).toHaveAttribute('width', '720')
  await expect(page.getByTestId('wall-title')).toHaveText('Mur 1 + Mur 2')
  await expect(page.getByTestId('group-seam')).toHaveCount(2)
  // une vague qui passe d'un mur à l'autre
  await poly(page, [[300, 60], [420, 200]])
  await page.getByTestId('tool-fill').click()
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 395, 20)
  // dessin continu : la zone peinte passe la jonction entre les deux murs (x = 400)
  const fillBox = (await page.getByTestId('fills').locator('path').first().boundingBox())!
  const seamX = (await wallToPage(page, 400, 0)).x
  expect(fillBox.x + fillBox.width).toBeGreaterThan(seamX + 20)
  // les surfaces du switcher : le groupe compte pour une
  await page.getByTestId('next-wall').click()
  await expect(page.getByTestId('wall-title')).toHaveText('Mur 3')
  await page.getByTestId('back-to-room').click()

  // 3D : les deux murs montrent chacun leur bande du dessin commun
  await expect.poll(() => texturedWalls(page)).toBe(4)
  const crops = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __roomScene: { walls: { innerMat: { map: { offset: { x: number }; repeat: { x: number } } | null } }[] } }).__roomScene
      return s.walls.slice(0, 2).map((w) => (w.innerMat.map ? [Math.round(w.innerMat.map.offset.x * 720), Math.round(w.innerMat.map.repeat.x * 720)] : null))
    })
  await expect.poll(crops).toEqual([[0, 400], [400, 320]])
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/step19-07-murs-lies.png` })

  // délier : chaque mur retrouve son dessin
  await page.getByTestId('plan-wall-1').click({ force: true })
  await page.getByTestId('unlink').click()
  await expect(page.getByTestId('plan-linked-0')).toHaveCount(0)
  await page.getByTestId('room-undo').click()
  await expect(page.getByTestId('plan-linked-0')).toHaveCount(1)

  // deux murs séparés : l'écart est un vide hachuré dans le dessin
  await page.keyboard.press('Escape')
  await page.getByTestId('plan-wall-1').click({ force: true })
  await page.getByTestId('edit-link').click()
  await page.getByTestId('link-check-0').uncheck()
  await page.getByTestId('link-check-3').check()
  // murs 2 et 4 (face à face) : l'écart est la distance entre la fin du mur 2 et le début du mur 4
  await expect(page.getByTestId('link-preview')).toContainText('1040 × 250')
  await page.getByTestId('link-confirm').click()
  await expect(page.getByTestId('room-save-state')).toHaveText('Enregistré')
  await page.getByTestId('plan-wall-1').click({ force: true })
  await page.getByTestId('paint-wall').click()
  await expect(page.getByTestId('wall')).toHaveAttribute('width', '1040')
  await expect(page.getByTestId('group-gap')).toHaveCount(1)
})

test('exporter un mur de pièce avec sa fenêtre', async ({ page }) => {
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('add-window').click()
  await page.getByTestId('paint-wall').click()
  await page.getByTestId('tool-fill').click()
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 30, 30)
  await page.getByTestId('export').click()
  await page.getByTestId('pick-D4').click()
  const source = await page.getByTestId('page-preview').first().locator('img').getAttribute('src')
  expect(decodeURIComponent(source!)).toContain('Fenêtre')
  expect(decodeURIComponent(source!)).toContain('Ouvertures et zones sans mur déduites')
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()])
  await pdf.saveAs(`${SHOTS}/controle-piece.pdf`)
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-svg').click()])
  await svg.saveAs('test-results/mur-piece.svg')
  const { readFileSync } = await import('node:fs')
  expect(readFileSync('test-results/mur-piece.svg', 'utf8')).toContain('Fenêtre')
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()])
  await png.saveAs(`${SHOTS}/controle-piece.png`)
})


test('les variantes de pièce comparent les surfaces nettes', async ({ page }) => {
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('add-window').click()
  await page.getByTestId('paint-wall').click()
  await page.getByTestId('tool-fill').click()
  await page.getByTestId('swatch-Terracotta').click()
  await clickWall(page, 30, 30)
  await page.getByTestId('variants-page').click()
  await expect(page.locator('.mini-swatch').first()).toHaveAttribute('title', /8.50 m²/)
  await page.getByTestId('snapshot').click()
  await page.getByTestId('variants-page').click()
  await page.getByTestId('pick-variant').nth(0).check()
  await page.getByTestId('pick-variant').nth(1).check()
  await page.getByTestId('compare').click()
  await expect(page.getByTestId('compare-pane')).toHaveCount(2)
  for (const pane of await page.getByTestId('compare-pane').all()) await expect(pane.locator('.compare-legend')).toContainText('8.50 m²')
  await page.getByRole('button', { name: '← Variantes' }).click()
  await expect(page.locator('.mini-swatch').first()).toHaveAttribute('title', /8.50 m²/)
})
