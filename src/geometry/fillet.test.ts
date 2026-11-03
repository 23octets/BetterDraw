import { describe, expect, it } from 'vitest'
import { filletAll, filletVertex } from './fillet'
import { arcGeometry, shapeToD } from './shapes'
import type { Shape } from '../model/types'

const L: Shape = { id: 'l', closed: false, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], segs: [{ t: 'line' }, { t: 'line' }] }
const SQ: Shape = { id: 's', closed: true, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }] }

describe('arrondir un sommet', () => {
  it('replaces a right angle by a tangent arc of the given radius', () => {
    const r = filletVertex(L, 1, 20)!
    expect(r.pts.map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6])).toEqual([[0, 0], [80, 0], [100, 20], [100, 100]])
    expect(r.segs.map((g) => g.t)).toEqual(['line', 'arc', 'line'])
    const g = arcGeometry(r.pts[1], r.pts[2], (r.segs[1] as { bulge: number }).bulge)
    expect(g.radius).toBeCloseTo(20)
    expect(g.center.x).toBeCloseTo(80)
    expect(g.center.y).toBeCloseTo(20)
  })
  it('endpoints and straight vertices cannot be rounded', () => {
    expect(filletVertex(L, 0, 10)).toBeNull()
    expect(filletVertex(L, 2, 10)).toBeNull()
  })
  it('clamps a radius too big for the neighbours', () => {
    const r = filletVertex(L, 1, 1000)!
    expect(r.pts[1].x).toBeCloseTo(55)
  })
  it('rounds every corner of a closed square', () => {
    const r = filletAll(SQ, 10)
    expect(r.closed).toBe(true)
    expect(r.pts).toHaveLength(8)
    expect(r.segs.filter((g) => g.t === 'arc')).toHaveLength(4)
    expect(shapeToD(r)).toMatch(/Z$/)
  })
  it('works on a vertex between curves', () => {
    const c: Shape = { id: 'c', closed: false, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 80 }], segs: [{ t: 'arc', bulge: 0.3 }, { t: 'cubic', c1: { x: 120, y: 10 }, c2: { x: 140, y: 40 } }] }
    const r = filletVertex(c, 1, 15)!
    expect(r.segs.map((g) => g.t)).toEqual(['arc', 'arc', 'cubic'])
  })
})
