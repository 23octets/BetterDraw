import { describe, expect, it } from 'vitest'
import { placeImage, resizeKeepRatio } from './images'

describe('images de référence', () => {
  it('places an image centered at 80 % of the wall, ratio kept', () => {
    const im = placeImage({ id: 'b', dataUrl: '', width: 400, height: 300 }, { w: 300, h: 250 }, 'x.png')
    expect(im.w).toBeCloseTo(240)
    expect(im.h).toBeCloseTo(180)
    expect(im.x).toBeCloseTo(30)
    expect(im.y).toBeCloseTo(35)
    expect(im.opacity).toBe(0.5)
  })
  it('resizes from a corner keeping the ratio and anchoring the opposite corner', () => {
    const img = { x: 10, y: 10, w: 100, h: 50 }
    const r = resizeKeepRatio(img, 2, { x: 210, y: 30 })
    expect(r).toEqual({ x: 10, y: 10, w: 200, h: 100 })
    const r2 = resizeKeepRatio(img, 0, { x: 60, y: 0 })
    expect(r2.x + r2.w).toBe(110)
    expect(r2.y + r2.h).toBe(60)
    expect(r2.h / r2.w).toBeCloseTo(0.5)
  })
})
