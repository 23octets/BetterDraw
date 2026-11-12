import { expect, test, type Page } from '@playwright/test'
import { newProject, openRoomsOnPlan, resetDb } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetDb(page)
})

async function openRoomWall(page: Page, name = 'Salon') {
  await openRoomsOnPlan(page)
  await page.getByTestId('kind-room').click()
  await page.locator('input[name=name]').fill(name)
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('paint-wall').click()
  await page.getByTestId('canvas').waitFor()
}

const wallBox = (page: Page) => page.getByTestId('wall').boundingBox()

test('pièce : renommer depuis la top bar, retour à la pièce et à l’accueil', async ({ page }) => {
  await openRoomWall(page)
  const title = page.getByTestId('project-name')
  await expect(title).toHaveValue('Salon')
  await title.fill('Séjour')
  await title.press('Enter')
  await expect(page.getByTestId('save-state')).toHaveText('Enregistré')

  // les deux retours sont explicites : flèche vers la gauche et destination
  const back = page.getByRole('navigation', { name: 'Retour' })
  await expect(back.getByRole('button')).toHaveText(['Projets', 'Pièce'])
  await page.getByTestId('back-to-room').click()
  await expect(page.getByTestId('room-title')).toHaveValue('Séjour')

  await page.getByTestId('plan-wall-0').click({ force: true })
  await page.getByTestId('paint-wall').click()
  await page.getByTestId('back-to-home').click()
  await expect(page.getByTestId('new-project-form')).toBeVisible()
  await expect(page.getByText('Séjour')).toBeVisible()
})

test('consultation : la barre d’outils disparaît sans déplacer le dessin', async ({ page }) => {
  await newProject(page)
  const before = await wallBox(page)
  await page.getByTestId('mode-consult').click()
  await expect(page.locator('.editor .toolbar')).toHaveCount(0)
  expect(await wallBox(page)).toEqual(before)
  // l'espace de travail récupère la place de la barre d'outils
  const stage = await page.locator('.stage').boundingBox()
  expect(stage!.x).toBe(0)
  await page.getByTestId('mode-edit').click()
  await expect(page.getByTestId('toolbar')).toBeVisible()
  expect(await wallBox(page)).toEqual(before)
})

test('panneau de droite : masquer, afficher, mémorisé', async ({ page }) => {
  await newProject(page)
  const before = await wallBox(page)
  const toggle = page.getByTestId('toggle-side-panel')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(page.locator('.editor > .side-panel')).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(await wallBox(page)).toEqual(before)
  const stage = await page.locator('.stage').boundingBox()
  expect(stage!.x + stage!.width).toBe(page.viewportSize()!.width)

  await page.reload()
  await page.getByTestId('canvas').waitFor()
  await expect(page.locator('.editor > .side-panel')).toHaveCount(0)
  await page.getByTestId('toggle-side-panel').click()
  await expect(page.locator('.editor > .side-panel')).toBeVisible()
})

test('menu grille : bordure complète au survol de chaque bouton', async ({ page }) => {
  await newProject(page)
  for (const id of ['grid-menu', 'toggle-grid']) {
    const btn = page.getByTestId(id)
    await btn.hover()
    const borders = await btn.evaluate((el) => {
      const s = getComputedStyle(el)
      return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth, s.borderLeftColor === s.borderTopColor, s.zIndex]
    })
    expect(borders).toEqual(['1px', '1px', '1px', '1px', true, '1'])
  }
})

test('raccourcis : nom à gauche aligné à droite, touches à droite', async ({ page }) => {
  await newProject(page)
  await page.getByTestId('toggle-shortcuts').click()
  const panel = page.getByTestId('shortcuts-panel')
  expect((await panel.boundingBox())!.width).toBeGreaterThanOrEqual(400)
  const row = panel.locator('li').first()
  const label = (await row.locator('.label').boundingBox())!
  const keys = (await row.locator('.keys').boundingBox())!
  expect(label.x + label.width).toBeLessThanOrEqual(keys.x)
  await expect(row.locator('.label')).toHaveCSS('text-align', 'right')
})

test('unités : jamais coupées de leur valeur, même dans une modale étroite', async ({ page }) => {
  await newProject(page)
  await page.getByTestId('open-estimate').click()
  const modal = page.getByTestId('estimate-modal')
  for (const width of [560, 320, 240]) {
    await modal.evaluate((el, w) => { el.style.width = `${w}px` }, width)
    const heights = await modal.evaluate((el) =>
      [...el.querySelectorAll('.field-input em, td.num')].map((e) => e.getClientRects().length === 1 && e.scrollWidth <= e.clientWidth + 1 ? 'ok' : e.textContent))
    expect(heights.every((h) => h === 'ok'), JSON.stringify(heights)).toBe(true)
    const suffix = (await modal.locator('.field-input em').first().boundingBox())!
    expect(suffix.height).toBeLessThan(20)
  }
})

test('top bar : rien n’est rogné entre 1001 et 1920 px', async ({ page }) => {
  await openRoomWall(page, 'Salon du rez-de-chaussée')
  for (const width of [1001, 1100, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 })
    const clipped = await page.evaluate(() => {
      const bar = document.querySelector('.topbar')!
      const out: string[] = []
      for (const el of bar.querySelectorAll<HTMLElement>('button, .save-state')) {
        const r = el.getBoundingClientRect()
        if (!r.width) continue
        if (r.right > innerWidth) out.push(el.dataset.testid ?? el.textContent ?? '')
        for (let p = el.parentElement; p && p !== bar; p = p.parentElement) {
          const q = p.getBoundingClientRect()
          if (getComputedStyle(p).overflow !== 'visible' && (r.right > q.right + 0.5 || r.left < q.left - 0.5)) out.push(el.dataset.testid ?? el.textContent ?? '')
        }
      }
      return out
    })
    expect(clipped, `${width} px`).toEqual([])
  }
})
