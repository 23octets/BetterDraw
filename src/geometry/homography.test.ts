import { describe, expect, it } from 'vitest'
import { applyH, homography, invertH, isConvexQuad, planWarp, warpPixels } from './homography'
import { defaultEdit, placement, planFor } from '../store/imageEdit'
import type { RefImage } from '../model/types'

const quad = [{ x: 100, y: 80 }, { x: 520, y: 40 }, { x: 560, y: 420 }, { x: 60, y: 380 }]

describe('perspective', () => {
  it('maps the 4 points exactly and inverts', () => {
    const dst = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }]
    const H = homography(quad, dst)
    quad.forEach((p, i) => {
      const q = applyH(H, p)
      expect(q.x).toBeCloseTo(dst[i].x, 6)
      expect(q.y).toBeCloseTo(dst[i].y, 6)
    })
    const back = applyH(invertH(H), { x: 400, y: 300 })
    expect(back.x).toBeCloseTo(560, 6)
    expect(back.y).toBeCloseTo(420, 6)
  })
  it('keeps the whole image and puts the quad in a rectangle', () => {
    const plan = planWarp({ w: 640, h: 480 }, quad)
    const tl = applyH(plan.H, quad[0])
    const br = applyH(plan.H, quad[2])
    expect(tl.x).toBeCloseTo(plan.rect.x, 6)
    expect(br.x).toBeCloseTo(plan.rect.x + plan.rect.w, 6)
    expect(br.y).toBeCloseTo(plan.rect.y + plan.rect.h, 6)
    expect(plan.full.w).toBeGreaterThan(plan.rect.w)
    expect(plan.rect.x).toBeGreaterThan(0)
  })
  it('uses the real dimensions for the proportions', () => {
    const plan = planWarp({ w: 640, h: 480 }, quad, { ratio: 2 })
    expect(plan.rect.w / plan.rect.h).toBeCloseTo(2, 6)
  })
  it('limits the output size', () => {
    const plan = planWarp({ w: 6000, h: 4000 }, [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }], { maxSide: 1000 })
    expect(Math.max(plan.full.w, plan.full.h)).toBeLessThanOrEqual(1000)
  })
  it('detects a bad quadrilateral', () => {
    expect(isConvexQuad(quad)).toBe(true)
    expect(isConvexQuad([quad[0], quad[2], quad[1], quad[3]])).toBe(false)
  })
  it('warps pixels with transparency outside the photo', () => {
    // 2×2 : rouge, vert / bleu, blanc ; agrandi ×2 par homothétie
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
    const Hinv = invertH([2, 0, 0, 0, 2, 0, 0, 0, 1])
    const out = warpPixels({ data, width: 2, height: 2 }, Hinv, { width: 4, height: 4 })
    expect([...out.slice(0, 4)]).toEqual([255, 0, 0, 255])
    expect([...out.slice((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4)]).toEqual([255, 255, 255, 255])
    const shifted = warpPixels({ data, width: 2, height: 2 }, invertH([1, 0, 3, 0, 1, 0, 0, 0, 1]), { width: 4, height: 2 })
    expect(shifted[3]).toBe(0) // hors image : transparent
  })
})

describe('placement de l’image corrigée', () => {
  const img: RefImage = { id: 'i', blobId: 'b', name: 'x', x: 10, y: 20, w: 200, h: 150, opacity: 1, locked: false, visible: true }
  const stored = { id: 'b', dataUrl: '', width: 400, height: 300 }
  it('a crop keeps the visible part in place', () => {
    const old = defaultEdit(img, stored)
    const p = placement(img, old, { rect: old.rect, realSize: null, crop: { x: 100, y: 50, w: 200, h: 150 } })
    expect(p).toEqual({ x: 60, y: 45, w: 100, h: 75 })
  })
  it('a perspective correction keeps the quad centre and width', () => {
    const old = defaultEdit(img, stored)
    const q = [{ x: 40, y: 30 }, { x: 360, y: 10 }, { x: 380, y: 290 }, { x: 20, y: 270 }]
    const plan = planFor(stored, q, null)!
    const p = placement(img, old, { rect: plan.rect, realSize: null, crop: { x: 0, y: 0, ...plan.full } })
    // centre du rectangle corrigé ≈ centre de l'image d'avant (le quad est centré)
    const k = p.w / plan.full.w
    expect(p.x + (plan.rect.x + plan.rect.w / 2) * k).toBeCloseTo(110, 0)
    // largeur du rectangle conservée (en cm)
    expect(plan.rect.w * k).toBeCloseTo(200, 6)
  })
  it('real dimensions give the exact scale', () => {
    const old = defaultEdit(img, stored)
    const q = [{ x: 40, y: 30 }, { x: 360, y: 10 }, { x: 380, y: 290 }, { x: 20, y: 270 }]
    const plan = planFor(stored, q, { w: 300, h: 250 })!
    const p = placement(img, old, { rect: plan.rect, realSize: { w: 300, h: 250 }, crop: { x: 0, y: 0, ...plan.full } })
    const k = p.w / plan.full.w
    expect(plan.rect.w * k).toBeCloseTo(300, 6)
    expect(plan.rect.h * k).toBeCloseTo(250, 6)
  })
  it('untouched corners and no dimensions: no warp', () => {
    expect(planFor(stored, [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], null)).toBeNull()
  })
})
