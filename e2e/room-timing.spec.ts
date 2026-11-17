import { expect, test } from '@playwright/test'
import type { PerspectiveCamera, Timer, WebGLRenderer } from 'three'
import { resetDb } from './helpers'

// La scène est déjà exposée pour les tests de textures dans step19-piece.
interface TimingScene {
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  timer: Timer & { _document: Document | null; _pageVisibilityHandler: unknown }
  setMode(mode: 'walk' | 'orbit'): void
  tick(): void
}

const scene = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const s = (window as unknown as { __roomScene: TimingScene }).__roomScene
  return { connected: s.timer._document === document, listening: s.timer._pageVisibilityHandler !== null }
})

test('3D : temps de visite, pause en arrière-plan et libération à la fermeture', async ({ page }) => {
  const warnings: string[] = []
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && /THREE\.(Clock|WebGLShadowMap)/.test(msg.text())) warnings.push(msg.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await resetDb(page)
  await page.getByTestId('kind-room').click()
  await page.getByRole('button', { name: 'Créer le projet' }).click()
  await expect(page.getByTestId('room-3d-canvas')).toBeVisible()
  await expect.poll(() => scene(page)).toEqual({ connected: true, listening: true })

  const distances = await page.evaluate(() => {
    const s = (window as unknown as { __roomScene: TimingScene }).__roomScene
    s.renderer.setAnimationLoop(null)
    s.setMode('walk')
    const originalNow = performance.now.bind(performance)
    let now = originalNow()
    let hidden = false
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    try {
      s.timer.reset()
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
      const step = (ms: number) => {
        const before = s.camera.position.clone()
        now += ms
        s.tick()
        return s.camera.position.distanceTo(before)
      }
      const normal = step(20)
      hidden = true
      document.dispatchEvent(new Event('visibilitychange'))
      const background = step(5000)
      hidden = false
      document.dispatchEvent(new Event('visibilitychange'))
      const resume = step(0)
      const next = step(20)
      const stalled = step(1000)
      return { normal, background, resume, next, stalled }
    } finally {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
      delete (document as unknown as { hidden?: boolean }).hidden
      delete (performance as unknown as { now?: () => number }).now
      s.setMode('orbit')
      s.renderer.setAnimationLoop(() => s.tick())
    }
  })
  expect(distances.normal).toBeCloseTo(1.6 * 0.02, 6)
  expect(distances.background).toBe(0)
  expect(distances.resume).toBe(0)
  expect(distances.next).toBeCloseTo(1.6 * 0.02, 6)
  expect(distances.stalled).toBeCloseTo(1.6 * 0.05, 6)

  // Le plan seul démonte la scène ; la rouvrir doit créer un nouvel écouteur.
  await page.getByTestId('layout-plan').click()
  await expect(page.getByTestId('room-3d-canvas')).toHaveCount(0)
  await expect.poll(() => scene(page)).toEqual({ connected: false, listening: false })
  await page.getByTestId('layout-split').click()
  await expect(page.getByTestId('room-3d-canvas')).toBeVisible()
  await expect.poll(() => scene(page)).toEqual({ connected: true, listening: true })
  expect(warnings).toEqual([])
  expect(errors).toEqual([])
})
