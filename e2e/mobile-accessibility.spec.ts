import { expect, test } from '@playwright/test'
import { clickWall, newProject, resetDb, wallToPage } from './helpers'

test('les dialogues confinent et restaurent le focus', async ({ page }) => {
  await resetDb(page)
  await newProject(page)
  for (const [trigger, dialog] of [['open-settings', 'settings-modal'], ['export', 'export-dialog']]) {
    await page.getByTestId(trigger).click()
    const modal = page.getByTestId(dialog)
    await expect(modal).toHaveAttribute('aria-modal', 'true')
    if (dialog === 'settings-modal') {
      const origin = page.getByTestId('origin-tr')
      await origin.focus()
      await page.keyboard.press('Enter')
      await expect(origin).toHaveAttribute('aria-pressed', 'true')
    }
    for (let i = 0; i < 35; i++) {
      await page.keyboard.press(i < 20 ? 'Tab' : 'Shift+Tab')
      expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(modal).toHaveCount(0)
    await expect(page.getByTestId(trigger)).toBeFocused()
  }
  const summary = page.locator('.editor-guide summary')
  await summary.click()
  await page.getByRole('button', { name: 'Fermer le guide' }).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('guide')).not.toBeVisible()
  await expect(summary).toBeFocused()
})

for (const width of [375, 768]) {
  test.describe(`consultation tactile à ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true })
    test('cases, cotes, pincement et export', async ({ page }) => {
      await resetDb(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await newProject(page)
      await expect(page.getByTestId('mode-consult')).toHaveClass('on')
      const canvas = page.getByTestId('canvas')
      expect((await canvas.boundingBox())!.width).toBe(width)
      const point = await wallToPage(page, 25, 225)
      await page.touchscreen.tap(point.x, point.y)
      await expect(page.getByTestId('consult-overlay')).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Cases du mur' })).toContainText('A1')
      await page.getByRole('button', { name: 'Case à droite', exact: true }).filter({ visible: true }).click()
      await expect(page.getByRole('navigation', { name: 'Cases du mur' })).toContainText('B1')
      const session = await page.context().newCDPSession(page)
      const box = (await canvas.boundingBox())!
      const x = box.x + box.width / 2, y = box.y + box.height / 2
      const before = await page.getByTestId('world').getAttribute('transform')
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] })
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 60, y: y + 30, id: 1 }, { x: x + 60, y: y + 30, id: 2 }] })
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await expect(page.getByTestId('world')).not.toHaveAttribute('transform', before!)
      await expect(page.getByRole('navigation', { name: 'Cases du mur' })).toContainText('B1')
      await page.getByTestId('export').click()
      await expect(page.getByTestId('export-pdf')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    })
  })
}

test.describe('petits écrans : paysage et page projet', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true })
  test('une case paysage garde ses cotes lisibles hors de la navigation', async ({ page }) => {
    await resetDb(page)
    await newProject(page)
    await page.getByRole('button', { name: 'Case à droite', exact: true }).filter({ visible: true }).click()
    const overlay = page.getByTestId('consult-overlay')
    const bounds = await overlay.locator('.consult-cote, .sub-cote').evaluateAll((els) =>
      els.filter((el) => getComputedStyle(el).display !== 'none').map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, text: el.textContent }
      }))
    const ys = bounds.map((r) => r.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(130)
    const nav = (await page.getByRole('navigation', { name: 'Cases du mur' }).boundingBox())!
    for (const r of bounds) expect(r.y).toBeGreaterThanOrEqual(nav.y + nav.height)
    for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j]
      expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `${a.text} / ${b.text}`).toBe(true)
    }
    await page.screenshot({ path: 'docs/screenshots/mobile-paysage.png' })
  })

  test('la page projet tient sur 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await resetDb(page)
    await newProject(page, 'Un projet au nom suffisamment long pour vérifier le retour à la ligne')
    await page.getByRole('button', { name: 'Projets', exact: true }).click()
    await page.getByTestId('open-variants').click()
    await expect(page.getByTestId('variant-card')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
    await page.screenshot({ path: 'docs/screenshots/mobile-projet.png' })
  })
})


test('les raccourcis ne modifient pas la sélection sous une modale', async ({ page }) => {
  await resetDb(page)
  await newProject(page)
  await page.getByTestId('tool-polyline').click()
  await clickWall(page, 50, 50)
  await clickWall(page, 150, 50)
  await page.keyboard.press('Enter')
  await page.getByTestId('tool-select').click()
  await clickWall(page, 100, 50)
  const shape = page.getByTestId('shapes').locator('path')
  const before = await shape.getAttribute('d')
  for (const [trigger, dialog] of [['open-settings', 'settings-modal'], ['export', 'export-dialog']]) {
    await page.getByTestId(trigger).click()
    for (const key of ['Delete', 'Backspace', 'ArrowRight']) await page.keyboard.press(key)
    await expect(shape).toHaveCount(1)
    await expect(shape).toHaveAttribute('d', before!)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(dialog)).toHaveCount(0)
    await expect(page.getByTestId('selection-section')).toBeVisible()
  }
})

test.describe('consultation tactile des pièces et tablettes', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })
  test('la pièce oriente vers la consultation des murs', async ({ page }) => {
    await resetDb(page)
    await page.getByTestId('kind-room').click()
    await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
    const nav = page.getByRole('navigation', { name: 'Consulter les murs' })
    await expect(nav).toBeVisible()
    await expect(page.locator('.plan-help')).toBeHidden()
    await expect(page.locator('.room-3d-help')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
    expect((await page.getByTestId('plan').boundingBox())!.height).toBeGreaterThanOrEqual(280)
    await nav.getByRole('button').first().click()
    await expect(page.getByTestId('mode-consult')).toHaveClass('on')
    await page.getByTestId('back-to-room').click()
    await expect(nav).toBeVisible()
  })

  test('la tablette paysage reste en consultation et les refus du plein écran sont expliqués', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 1024 })
    await page.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { value: true })
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('Refus simulé'))
    })
    await resetDb(page)
    await newProject(page)
    await expect(page.getByTestId('mode-consult')).toHaveClass('on')
    expect((await page.getByTestId('canvas').boundingBox())!.width).toBe(1366)
    await page.getByRole('button', { name: 'Plein écran', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Le plein écran n’a pas pu être activé.')
  })

  test('le plein écran indisponible ne propose pas de bouton inactif', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }))
    await resetDb(page)
    await newProject(page)
    await expect(page.getByRole('button', { name: 'Plein écran', exact: true })).toHaveCount(0)
  })
})


for (const viewport of [{ width: 375, height: 812 }, { width: 667, height: 375 }]) {
  test.describe(`plan en lecture seule à ${viewport.width}px`, () => {
    test.use({ viewport, hasTouch: true })
    test('un glissement fait défiler sans déplacer un angle', async ({ page }) => {
      await resetDb(page)
      await page.getByTestId('kind-room').click()
      await page.getByRole('button', { name: 'Créer le projet', exact: true }).click()
      const corner = page.getByTestId('plan-corner-0')
      const before = await corner.evaluate((el) => [el.getAttribute('cx'), el.getAttribute('cy')])
      const box = (await corner.boundingBox())!
      const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)
      const session = await page.context().newCDPSession(page)
      const x = box.x + box.width / 2, y = box.y + box.height / 2
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
      for (let i = 1; i <= 5; i++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 4, y: y - i * 12, id: 1 }] })
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      expect(await corner.evaluate((el) => [el.getAttribute('cx'), el.getAttribute('cy')])).toEqual(before)
      await expect(page.getByTestId('room-undo')).toBeDisabled()
      if (scrollable) await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      else expect(await page.evaluate(() => window.scrollY)).toBe(0)
      await expect(page.getByRole('navigation', { name: 'Consulter les murs' })).toBeAttached()
    })
  })
}
