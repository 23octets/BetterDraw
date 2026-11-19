import type { Page } from '@playwright/test'

export const SHOTS = 'docs/screenshots'

/** Les pièces s'ouvrent sur le plan seul : sans scène 3D, le rendu logiciel de la CI ne ralentit pas le test. */
export async function openRoomsOnPlan(page: Page) {
  await page.evaluate(() => localStorage.setItem('bd:room-layout', 'plan'))
}

export async function resetDb(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('betterdraw')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  })
  await page.reload()
}

export async function newProject(page: Page, name = 'Chambre de Léa', w = 300, h = 250) {
  await page.getByTestId('new-project-form').locator('input[name=name]').fill(name)
  await page.locator('input[name=width]').fill(String(w))
  await page.locator('input[name=height]').fill(String(h))
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await page.getByTestId('canvas').waitFor()
}

/** Convertit des coordonnées mur (cm) en coordonnées page (px). */
export async function wallToPage(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('wall').boundingBox())!
  const wall = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=wall]')!
    return { w: +el.getAttribute('width')!, h: +el.getAttribute('height')! }
  })
  return { x: box.x + (x / wall.w) * box.width, y: box.y + (y / wall.h) * box.height }
}

export async function clickWall(page: Page, x: number, y: number, modifiers: ('Shift' | 'Alt' | 'Meta')[] = []) {
  const p = await wallToPage(page, x, y)
  for (const m of modifiers) await page.keyboard.down(m)
  await page.mouse.click(p.x, p.y)
  for (const m of modifiers) await page.keyboard.up(m)
}

export async function setField(page: Page, testId: string, value: string | number) {
  const f = page.getByTestId(testId)
  await f.fill(String(value))
  await f.press('Enter')
}

/** Prépare une pièce pour les parcours dédiés ; l'accueil crée désormais un mur. */
export async function newRoom(page: Page, name = 'Nouvelle pièce', shape: 'rect' | 'L' = 'rect', withWall = false) {
  await page.evaluate(async ({ name, shape, withWall }) => {
    const path = '/src/store/rooms.ts'
    const defaultsPath = '/src/room/geometry.ts'
    const { createRoomProject } = await import(/* @vite-ignore */ path)
    const { DEFAULT_ROOM } = await import(/* @vite-ignore */ defaultsPath)
    const project = await createRoomProject(name, DEFAULT_ROOM, shape, withWall ? { w: 300, h: 250 } : undefined)
    window.location.hash = `/r/${project.id}`
  }, { name, shape, withWall })
  await page.getByTestId('room-wall-item').first().waitFor({ state: 'attached' })
}
