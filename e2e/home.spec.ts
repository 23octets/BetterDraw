import { expect, test } from '@playwright/test'

test('export groupé, réimport, copies, recherche et tri', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const path = '/src/store/repo.ts'
    const repo = await import(/* @vite-ignore */ path)
    for (let i = 0; i < 9; i++) await repo.createProject(`Projet ${i}`, { w: 100 + i * 10, h: 250 })
  })
  await expect(page.getByTestId('project-card')).toHaveCount(9)
  await page.getByRole('searchbox').fill('Projet 1')
  await expect(page.locator('.h-grid .h-card')).toHaveCount(1)
  await expect(page.locator('.h-grid')).toContainText('Projet 1')
  await page.getByRole('searchbox').fill('introuvable')
  await expect(page.getByText('Aucun projet ne porte ce nom.')).toBeVisible()
  await page.getByRole('searchbox').fill('')
  await page.getByRole('combobox').selectOption('name')
  await expect(page.locator('.h-card h3').first()).toHaveText('Projet 0')
  await page.getByRole('combobox').selectOption('width')
  await expect(page.locator('.h-card h3').first()).toHaveText('Projet 7')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tout télécharger', exact: true }).first().click()
  const file = await downloading
  await expect(page.locator('.h-copy.ok')).toHaveCount(9)
  await page.evaluate(async () => {
    const path = '/src/store/db.ts'
    const { db } = await import(/* @vite-ignore */ path)
    await db.transaction('rw', db.projects, db.walls, db.variants, db.entries, db.images, async () => {
      await Promise.all([db.projects.clear(), db.walls.clear(), db.variants.clear(), db.entries.clear(), db.images.clear()])
    })
    localStorage.removeItem('frsque:copies')
  })
  await expect(page.getByTestId('project-card')).toHaveCount(0)
  await page.getByTestId('import-project').setInputFiles((await file.path())!)
  await expect(page.getByTestId('import-msg')).toHaveText('9 projets importés')
  await expect(page.getByTestId('project-card')).toHaveCount(9)
  await expect(page.locator('.h-copy.ok')).toHaveCount(9)
  await page.evaluate(async () => {
    const path = '/src/store/db.ts'
    const { db } = await import(/* @vite-ignore */ path)
    const p = await db.projects.toCollection().first()
    await db.projects.update(p.id, { updatedAt: Date.now() + 1000 })
  })
  await expect(page.locator('.h-copy.old')).toHaveCount(1)
})

test('fresque et quantités restent côte à côte sur deux plans, desktop et mobile', async ({ page }) => {
  await page.goto('/')
  for (const width of [1440, 980, 768, 560, 390, 360]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('.h-mural')).toBeVisible()
    await expect(page.locator('.h-qty')).toBeVisible()
    await expect(page.locator('.h-color-links g')).toHaveCount(4)
    // Les liaisons doivent rester ancrées aux pastilles après chaque changement de largeur.
    await expect.poll(() => page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('.h-color-links')!
      const matrix = svg.getScreenCTM()!
      const chips = document.querySelectorAll('.h-chips .sw[data-color]')
      return [...svg.querySelectorAll('g')].every((g, i) => {
        const dot = g.querySelector('circle:last-child')!
        const p = new DOMPoint(+dot.getAttribute('cx')!, +dot.getAttribute('cy')!).matrixTransform(matrix)
        const r = chips[i].getBoundingClientRect()
        return Math.abs(p.x - (r.left + r.width / 2)) < 1 && Math.abs(p.y - (r.top + r.height / 2)) < 1
      })
    })).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.locator('.h-qty small').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth))).toBe(true)
  }
  await expect(page.getByText('Guide en 5 étapes')).toHaveCount(0)
  await expect(page.getByText('Tu as déjà une copie de secours')).toHaveCount(0)
  await page.setViewportSize({ width: 360, height: 800 })
  await page.screenshot({ path: 'test-results/accueil-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'test-results/accueil-desktop.png', fullPage: true })
})

test('l’accueil mobile de découverte tient sur un écran sans masquer son contenu', async ({ page }) => {
  await page.goto('/')
  for (const [width, height] of [[390, 844], [375, 812], [360, 800]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => document.fonts.ready)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), `${width} × ${height}`).toBeLessThanOrEqual(height)
    await expect(page.getByRole('button', { name: 'Créer le projet', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mentions légales', exact: true })).toBeVisible()
    await expect.poll(() => page.locator('.h-footer').evaluate((footer) => Math.abs(footer.getBoundingClientRect().bottom - innerHeight)), `${width} × ${height} : footer en bas`).toBeLessThanOrEqual(1)
  }
})

test('l’accueil mobile avec un projet tient aussi sur un écran', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Ouvrir le projet exemple' }).click()
  await page.getByTestId('canvas').waitFor()
  await page.goto('/')
  await expect(page.getByTestId('project-card')).toHaveCount(1)
  for (const [width, height] of [[390, 844], [375, 812], [360, 800]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => document.fonts.ready)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), `${width} × ${height}`).toBeLessThanOrEqual(height)
    await expect(page.getByRole('button', { name: 'Reprendre le dessin', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mentions légales', exact: true })).toBeVisible()
    await expect.poll(() => page.locator('.h-footer').evaluate((footer) => Math.abs(footer.getBoundingClientRect().bottom - innerHeight)), `${width} × ${height} : footer en bas`).toBeLessThanOrEqual(1)
  }
  await page.screenshot({ path: 'test-results/accueil-projet-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: 'test-results/accueil-projet-desktop.png', fullPage: true })
})

test('l’accueil mobile tient aussi quand la connexion est proposée', async ({ page }) => {
  await page.route('**/api/cloud', (route) => route.fulfill({ json: { databaseUrl: 'https://compte-test.dexie.cloud' } }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible()
  for (const [width, height] of [[390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => document.fonts.ready)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), `${width} × ${height}`).toBeLessThanOrEqual(height)
  }
})

test('sur mobile, les deux murs restent entièrement sous le formulaire', async ({ page }) => {
  await page.goto('/')
  for (const width of [360, 375, 393, 430, 560, 700]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => document.fonts.ready)
    const band = (await page.locator('.h-band').boundingBox())!
    for (const top of await page.locator('.h-wall-top').all()) {
      const bounds = (await top.boundingBox())!
      expect(bounds.y, `chant du mur à ${width}px`).toBeGreaterThanOrEqual(band.y + band.height + 8)
    }
  }
})
