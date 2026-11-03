import { describe, expect, it } from 'vitest'
import { bendSegment, cloneShapes, moveVertex, shapesInRect, toggleClosed, selectionCenter } from './edit'
import { arcMidPoint, transformShape } from './shapes'
import { mirrorMat, rotateMat, scaleMat } from './vec'
import type { Shape } from '../model/types'
import { hitShape, shapeHandles } from '../tools/select'

const sq: Shape = {
  id: 's', closed: true,
  pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }],
}

describe('édition', () => {
  it('moves a vertex and the attached Bézier handles follow', () => {
    const s: Shape = { id: 'c', closed: false, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], segs: [{ t: 'cubic', c1: { x: 2, y: 5 }, c2: { x: 8, y: 5 } }] }
    const m = moveVertex(s, 1, { x: 20, y: 10 })
    expect(m.pts[1]).toEqual({ x: 20, y: 10 })
    expect(m.segs[0]).toEqual({ t: 'cubic', c1: { x: 2, y: 5 }, c2: { x: 18, y: 15 } })
  })
  it('bends a straight segment into an arc through the cursor', () => {
    const b = bendSegment(sq, 0, { x: 50, y: -20 })
    expect(b.segs[0].t).toBe('arc')
    const m = arcMidPoint(b.pts[0], b.pts[1], (b.segs[0] as { bulge: number }).bulge)
    expect(m.x).toBeCloseTo(50)
    expect(m.y).toBeCloseTo(-20)
    // presque droit → reste une droite
    expect(bendSegment(sq, 0, { x: 50, y: 0.0001 }).segs[0].t).toBe('line')
  })
  it('mirror, rotate and scale around the selection center', () => {
    const c = selectionCenter([sq])
    expect(c).toEqual({ x: 50, y: 50 })
    const r = transformShape(sq, rotateMat(Math.PI / 2, c))
    expect(r.pts[0].x).toBeCloseTo(100)
    expect(r.pts[0].y).toBeCloseTo(0)
    const s = transformShape(sq, scaleMat(2, c))
    expect(s.pts[0]).toEqual({ x: -50, y: -50 })
    const m = transformShape(sq, mirrorMat('h', c))
    expect(m.pts[1]).toEqual({ x: 0, y: 0 })
  })
  it('clones with new ids and offset', () => {
    const [c] = cloneShapes([sq], { x: 10, y: 10 })
    expect(c.id).not.toBe(sq.id)
    expect(c.pts[0]).toEqual({ x: 10, y: 10 })
  })
  it('marquee selects fully contained shapes', () => {
    expect(shapesInRect([sq], { x: -1, y: -1 }, { x: 101, y: 101 })).toEqual(['s'])
    expect(shapesInRect([sq], { x: -1, y: -1 }, { x: 50, y: 101 })).toEqual([])
  })
  it('opens and closes a shape', () => {
    const o = toggleClosed(sq)
    expect(o.closed).toBe(false)
    expect(o.segs).toHaveLength(3)
    expect(toggleClosed(o).segs).toHaveLength(4)
  })
  it('hit-tests on the stroke and lists handles', () => {
    expect(hitShape([sq], { x: 50, y: 2 }, 3)?.id).toBe('s')
    expect(hitShape([sq], { x: 50, y: 50 }, 3)).toBeNull()
    expect(shapeHandles(sq).filter((h) => h.h.kind === 'vertex')).toHaveLength(4)
    expect(shapeHandles(sq).filter((h) => h.h.kind === 'mid')).toHaveLength(4)
  })
})
