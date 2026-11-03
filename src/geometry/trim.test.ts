import { describe, expect, it } from 'vitest'
import { planTrim, splitSegment, subShape } from './trim'
import { arcMidPoint, shapeLength, shapeToD } from './shapes'
import type { Shape } from '../model/types'

const W = { w: 300, h: 200 }
const line = (id: string, a: [number, number], b: [number, number]): Shape => ({ id, pts: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], segs: [{ t: 'line' }], closed: false })

describe('outil couper', () => {
  it('splits an arc into two arcs on the same circle', () => {
    const r = splitSegment({ x: 0, y: 0 }, { x: 2, y: 0 }, { t: 'arc', bulge: 1 }, 0.5)
    expect(r.m.x).toBeCloseTo(1)
    expect(Math.abs(r.m.y)).toBeCloseTo(1)
    expect(Math.abs((r.a as { bulge: number }).bulge)).toBeCloseTo(Math.tan(Math.PI / 8))
    const s: Shape = { id: 's', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }], segs: [{ t: 'arc', bulge: 1 }], closed: false }
    const half = subShape(s, 0, 0.5)
    expect(shapeLength(half)).toBeCloseTo(Math.PI / 2, 2)
    const m = arcMidPoint(half.pts[0], half.pts[1], (half.segs[0] as { bulge: number }).bulge)
    expect(Math.hypot(m.x - 1, m.y)).toBeCloseTo(1)
  })
  it('removes the middle piece of a line crossed twice', () => {
    const doc = { wall: W, shapes: [line('h', [20, 100], [280, 100]), line('a', [100, 0], [100, 200]), line('b', [200, 0], [200, 200])] }
    const plan = planTrim(doc, doc.shapes[0], { x: 150, y: 100 })!
    expect(shapeToD(plan.removed)).toBe('M100 100L200 100')
    expect(plan.keep.map(shapeToD)).toEqual(['M20 100L100 100', 'M200 100L280 100'])
  })
  it('removes a dangling end up to the intersection', () => {
    const doc = { wall: W, shapes: [line('h', [20, 100], [280, 100]), line('a', [100, 0], [100, 200])] }
    const plan = planTrim(doc, doc.shapes[0], { x: 40, y: 100 })!
    expect(plan.keep.map(shapeToD)).toEqual(['M100 100L280 100'])
  })
  it('cuts a polyline across vertices', () => {
    const poly: Shape = { id: 'p', pts: [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }], segs: [{ t: 'line' }, { t: 'line' }], closed: false }
    const doc = { wall: W, shapes: [poly, line('a', [100, 0], [100, 200]), line('b', [0, 100], [300, 100])] }
    const plan = planTrim(doc, poly, { x: 150, y: 60 })!
    expect(shapeToD(plan.removed)).toBe('M100 50L150 50L150 100')
    expect(plan.keep.map(shapeToD)).toEqual(['M50 50L100 50', 'M150 100L150 150'])
  })
  it('opens a closed shape between two crossings', () => {
    const sq: Shape = { id: 's', closed: true, pts: [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }], segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }] }
    const doc = { wall: W, shapes: [sq, line('a', [100, 0], [100, 200])] }
    const plan = planTrim(doc, sq, { x: 150, y: 100 })!
    expect(plan.keep).toHaveLength(1)
    expect(plan.keep[0].closed).toBe(false)
    expect(shapeToD(plan.keep[0])).toBe('M100 150L50 150L50 50L100 50')
  })
  it('a line between the wall edges is cut at the wall', () => {
    const doc = { wall: W, shapes: [line('h', [-20, 100], [320, 100])] }
    const plan = planTrim(doc, doc.shapes[0], { x: 310, y: 100 })!
    expect(plan.keep.map(shapeToD)).toEqual(['M-20 100L300 100'])
  })
})
