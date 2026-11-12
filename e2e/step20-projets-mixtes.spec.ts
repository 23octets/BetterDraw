import { expect, test, type Page } from '@playwright/test'
import { openRoomsOnPlan, resetDb } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetDb(page)
  await openRoomsOnPlan(page)
})

async function create(page: Page, kind: 'wall' | 'room' | 'both', name: string) {
  await page.goto('/#/')
  await page.getByTestId(`kind-${kind}`).click()
  await page.getByTestId('new-project-form').locator('input[name=name]').fill(name)
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await page.waitForURL(kind === 'wall' ? /#\/v\// : /#\/r\//)
}

/** Boutons d'action sortant de la zone intérieure (padding compris) de leur carte. */
const overflowingActions = (page: Page) =>
  page.evaluate(() => {
    const bad: string[] = []
    for (const card of document.querySelectorAll('[data-testid=project-card]')) {
      const r = card.getBoundingClientRect()
      const bar = card.querySelector('.card-actions')!
      const cs = getComputedStyle(bar)
      const left = r.left + parseFloat(cs.paddingLeft) - 0.5
      const right = r.right - parseFloat(cs.paddingRight) + 0.5
      for (const b of bar.querySelectorAll('button')) {
        const q = b.getBoundingClientRect()
        if (q.left < left || q.right > right) bad.push(`${(card as HTMLElement).dataset.kind}: ${b.textContent || b.getAttribute('aria-label')}`)
      }
    }
    return bad
  })

/** Boutons du formulaire de création rognés ou sortant de leur groupe. */
const clippedFormButtons = (page: Page) =>
  page.evaluate(() => {
    const bad: string[] = []
    for (const b of document.querySelectorAll<HTMLElement>('[data-testid=new-project-form] button')) {
      if (b.scrollWidth > b.clientWidth + 1) bad.push(`rogné : ${b.textContent}`)
      const seg = b.closest('.seg')
      if (seg) {
        const s = seg.getBoundingClientRect(), q = b.getBoundingClientRect()
        if (q.left < s.left - 0.5 || q.right > s.right + 0.5) bad.push(`hors du groupe : ${b.textContent}`)
      }
    }
    return bad
  })

test('accueil : les actions tiennent dans la carte et « En L » est visible, quelle que soit la largeur', async ({ page }) => {
  await create(page, 'wall', 'Mur seul')
  await create(page, 'room', 'Nouvelle pièce')
  await create(page, 'both', 'Pièce et mur 2D avec un nom vraiment long')
  await page.goto('/#/')
  await expect(page.getByTestId('project-card')).toHaveCount(3)
  for (const width of [1440, 1180, 900, 700, 520, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await overflowingActions(page), `largeur ${width}`).toEqual([])
    for (const kind of ['room', 'both'] as const) {
      await page.getByTestId(`kind-${kind}`).click()
      await expect(page.getByTestId('shape-L')).toBeVisible()
      expect(await clippedFormButtons(page), `largeur ${width}, ${kind}`).toEqual([])
    }
  }
})

test('pièce 3D + mur 2D : création, carte, bascule vers la 2D', { tag: '@essentiel' }, async ({ page }) => {
  await create(page, 'both', 'Salon')
  await expect(page.getByTestId('room-wall-item')).toHaveCount(4)
  await expect(page.getByTestId('flat-wall')).toContainText('Ouvrir le mur 2D')
  await page.getByTestId('layout-2d').click()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await expect(page.getByTestId('back-to-room')).toHaveCount(0)

  await page.goto('/#/')
  const card = page.getByTestId('project-card')
  await expect(card).toHaveAttribute('data-kind', 'both')
  await expect(card).toContainText('Pièce 3D + mur 2D')
  await expect(card).toContainText('Mur 2D · 300 × 250 cm')
  await card.getByTestId('open-room').click()
  await expect(page.getByTestId('plan')).toBeVisible()

  // dans la pièce, la 2D ouvre le mur sélectionné
  await page.getByTestId('plan-wall-1').click()
  await page.getByTestId('layout-2d').click()
  await expect(page.getByTestId('wall-title')).toHaveText('Mur 2')
  await page.getByTestId('back-to-room').click()
  await expect(page.getByTestId('plan')).toBeVisible()
})

test('pièce seule : ajouter un mur 2D', async ({ page }) => {
  await create(page, 'room', 'Chambre')
  await page.getByTestId('add-flat-wall').click()
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.goto('/#/')
  await expect(page.getByTestId('project-card')).toHaveAttribute('data-kind', 'both')
})

test('décroché en L sur le mur sélectionné', async ({ page }) => {
  await create(page, 'room', 'Chambre')
  const corners = page.locator('[data-testid^=plan-corner-]')
  await expect(corners).toHaveCount(4)
  // mur 1 (en haut) : son coin de droite est entaillé, pas l'angle par défaut (en bas à droite)
  await page.getByTestId('plan-wall-0').click()
  await expect(page.getByTestId('tool-notch')).toHaveAttribute('data-corner', '1')
  await page.getByTestId('tool-notch').click()
  await expect(corners).toHaveCount(6)
  const pos = async (j: number) => {
    const c = corners.nth(j)
    return { x: Math.round(+(await c.getAttribute('cx'))!), y: Math.round(+(await c.getAttribute('cy'))!) }
  }
  const [a, b, c, d] = [await pos(0), await pos(1), await pos(2), await pos(3)]
  // le mur du haut est raccourci, l'encoche rentre vers le bas puis repart à droite
  expect(b.y).toBe(a.y)
  expect(b.x).toBeGreaterThan(a.x)
  expect(c.x).toBe(b.x)
  expect(c.y).toBeGreaterThan(b.y)
  expect(d.y).toBe(c.y)
  expect(d.x).toBeGreaterThan(c.x)
})

test('importer une fresque d’un autre projet dans un mur de la pièce', { tag: '@essentiel' }, async ({ page }) => {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Créer un projet exemple' }).click()
  await page.getByTestId('canvas').waitFor()
  await create(page, 'room', 'Chambre')
  await page.getByTestId('plan-wall-0').click()
  await page.getByTestId('import-fresco').click()
  const dialog = page.getByTestId('fresco-import')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('fresco-source')).toHaveCount(2)
  await dialog.getByTestId('fresco-filter').fill('paysage')
  await expect(dialog.getByTestId('fresco-pick')).toHaveCount(1)
  await dialog.getByTestId('fresco-pick').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('room-flash')).toContainText('Fresque copiée dans Mur 1')
  await expect(page.getByTestId('display-variant')).toHaveValue(/.+/)
  await expect(page.getByTestId('display-variant').locator('option')).toHaveCount(2)
  await page.getByTestId('paint-wall').click()
  await expect(page.getByTestId('canvas')).toBeVisible()
  // la copie garde les cotes du mur de la pièce
  await expect(page.getByTestId('wall')).toHaveAttribute('width', '400')
})
