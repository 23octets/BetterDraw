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

describe('poignées de Bézier des deux côtés', () => {
  // courbe de Bézier puis arc, lisses au sommet (100, 0)
  const s: Shape = {
    id: 'm', closed: false,
    pts: [{ x: 0, y: 50 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
    segs: [{ t: 'cubic', c1: { x: 30, y: 50 }, c2: { x: 70, y: 0 } }, { t: 'arc', bulge: -0.3 }],
  }
  it('a vertex touching a Bézier curve has a handle on the arc side too', () => {
    const virt = shapeHandles(s).filter((h) => h.h.kind === 'ctrl' && (h.h as { virtual?: boolean }).virtual)
    expect(virt).toHaveLength(1)
    expect(virt[0].h).toMatchObject({ i: 1, which: 'c1' })
  })
  it('dragging that handle turns the arc into a Bézier curve with the same ends', async () => {
    const { moveControl, segAsCubic } = await import('./edit')
    const eq = segAsCubic(s, 1)
    const r = moveControl(s, 1, 'c1', { x: eq.c1.x + 10, y: eq.c1.y - 20 }, true)
    expect(r.segs[1].t).toBe('cubic')
    expect((r.segs[1] as { c2: { x: number } }).c2.x).toBeCloseTo(eq.c2.x)
    expect(r.pts).toEqual(s.pts)
  })
  it('a smooth vertex keeps its handles aligned', async () => {
    const { moveControl } = await import('./edit')
    const line: Shape = {
      id: 'l', closed: false,
      pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
      segs: [{ t: 'cubic', c1: { x: 30, y: 0 }, c2: { x: 70, y: 0 } }, { t: 'cubic', c1: { x: 140, y: 0 }, c2: { x: 170, y: 0 } }],
    }
    const r = moveControl(line, 1, 'c1', { x: 100, y: -40 })
    const c2 = (r.segs[0] as { c2: { x: number; y: number } }).c2
    expect(c2.x).toBeCloseTo(100)
    expect(c2.y).toBeCloseTo(30) // longueur conservée (30), opposée
    const broken = moveControl(line, 1, 'c1', { x: 100, y: -40 }, true)
    expect((broken.segs[0] as { c2: { x: number } }).c2.x).toBe(70)
  })
})
