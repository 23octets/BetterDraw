import { expect, test } from '@playwright/test'
import { newProject, resetDb, wallToPage } from './helpers'

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
