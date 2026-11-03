import { describe, expect, it } from 'vitest'
import { gridStrokeFor } from './grid'
import { subLines } from '../tools/consult'
import { shapeHandles } from '../tools/select'
import type { Shape } from '../model/types'

describe('retours d’usage', () => {
  it('grid color contrasts with the paint underneath', () => {
    expect(gridStrokeFor('#f4f1ea')).toContain('200,100,59') // fond clair : accent
    expect(gridStrokeFor('#c8643b')).not.toContain('200,100,59') // terracotta : pas l'accent
    expect(gridStrokeFor('#33363b')).toContain('255,255,255') // sombre : blanc
    expect(gridStrokeFor('#e0a43a')).toContain('20,20,22') // ocre : noir
  })
  it('sub-grid lines are aligned on the grid origin', () => {
    const doc = { wall: { w: 300, h: 250 }, grid: { origin: 'bl' } }
    const r = subLines({ x: 150, y: 50, w: 50, h: 50 }, 10, doc)
    expect(r.v.map((l) => l.cote)).toEqual([160, 170, 180, 190])
    expect(r.h.map((l) => l.cote)).toEqual([160, 170, 180, 190])
    expect(r.h[0].pos).toBe(90)
  })
  it('a Bézier handle stuck on its vertex is shown aside', () => {
    const s: Shape = { id: 'c', closed: false, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], segs: [{ t: 'cubic', c1: { x: 0, y: 0 }, c2: { x: 70, y: 30 } }] }
    const h = shapeHandles(s, 5).find((x) => x.h.kind === 'ctrl' && x.h.which === 'c1')!
    expect(h.p.x).toBeGreaterThan(5)
    const h2 = shapeHandles(s, 5).find((x) => x.h.kind === 'ctrl' && x.h.which === 'c2')!
    expect(h2.p).toEqual({ x: 70, y: 30 })
  })
})

describe('poignées', () => {
  it('a Bézier segment also has a mid handle to turn it into an arc', () => {
    const s: Shape = { id: 'c', closed: false, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], segs: [{ t: 'cubic', c1: { x: 30, y: -40 }, c2: { x: 70, y: -40 } }] }
    const kinds = shapeHandles(s).map((h) => h.h.kind)
    expect(kinds.filter((k) => k === 'mid')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'ctrl')).toHaveLength(2)
  })
})
