import { describe, expect, it } from 'vitest'
import { arcGeometry, arcMidPoint, bulgeFromThrough, segEndTangent, segPoint, segStartTangent, shapeToD, tangentArcBulge, transformShape, shapeLength } from './shapes'
import { colIndex, colLabel, gridLayout, toGridCoords } from './grid'
import { mirrorMat, rotateMat } from './vec'
import type { Shape } from '../model/types'

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('arcs', () => {
  it('bulge from a through point on a half circle', () => {
    const b = bulgeFromThrough({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: -1 })
    close(Math.abs(b), 1)
    const m = arcMidPoint({ x: 0, y: 0 }, { x: 2, y: 0 }, b)
    close(m.x, 1); close(m.y, -1)
    const g = arcGeometry({ x: 0, y: 0 }, { x: 2, y: 0 }, b)
    close(g.radius, 1); close(g.center.x, 1); close(g.center.y, 0)
  })
  it('bulge from through point on a minor and major arc', () => {
    const p0 = { x: 0, y: 0 }, p1 = { x: 10, y: 0 }
    // point sur le cercle de centre (5, 5) rayon √50, côté haut (petit arc)
    const r = Math.sqrt(50)
    const tMinor = { x: 5, y: 5 - r }
    const bm = bulgeFromThrough(p0, p1, tMinor)
    expect(Math.abs(bm)).toBeLessThan(1)
    close(arcMidPoint(p0, p1, bm).y, 5 - r)
    const tMajor = { x: 5, y: 5 + r }
    const bM = bulgeFromThrough(p0, p1, tMajor)
    expect(Math.abs(bM)).toBeGreaterThan(1)
    close(arcMidPoint(p0, p1, bM).y, 5 + r)
  })
  it('segPoint follows the arc through its midpoint', () => {
    const s: Shape = { id: 'a', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }], segs: [{ t: 'arc', bulge: bulgeFromThrough({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }) }], closed: false }
    const m = segPoint(s, 0, 0.5)
    close(m.x, 1); close(m.y, 1)
    const e = segPoint(s, 0, 1)
    close(e.x, 2); close(e.y, 0)
    close(shapeLength(s), Math.PI, 1e-2)
  })
  it('tangent arc is tangent to the incoming direction', () => {
    const p0 = { x: 0, y: 0 }, p1 = { x: 1, y: 1 }
    const b = tangentArcBulge(p0, { x: 1, y: 0 }, p1)
    const s: Shape = { id: 'a', pts: [p0, p1], segs: [{ t: 'arc', bulge: b }], closed: false }
    const t0 = segStartTangent(s, 0)
    close(t0.x, 1); close(t0.y, 0)
    const t1 = segEndTangent(s, 0)
    close(t1.x, 0); close(t1.y, 1)
    const m = arcMidPoint(p0, p1, b)
    close(m.x, Math.SQRT1_2); close(m.y, 1 - Math.SQRT1_2)
  })
  it('svg path for an arc uses the right flags', () => {
    const s: Shape = { id: 'a', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }], segs: [{ t: 'arc', bulge: bulgeFromThrough({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: -1 }) }], closed: false }
    expect(shapeToD(s)).toBe('M0 0A1 1 0 0 1 2 0')
  })
  it('mirror flips arc orientation and rotation keeps it', () => {
    const s: Shape = { id: 'a', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }], segs: [{ t: 'arc', bulge: 1 }], closed: false }
    const before = arcMidPoint(s.pts[0], s.pts[1], 1)
    const m = transformShape(s, mirrorMat('v', { x: 1, y: 0 }))
    const after = arcMidPoint(m.pts[0], m.pts[1], (m.segs[0] as { bulge: number }).bulge)
    close(after.y, -before.y)
    const r = transformShape(s, rotateMat(Math.PI / 2, { x: 0, y: 0 }))
    const mr = arcMidPoint(r.pts[0], r.pts[1], (r.segs[0] as { bulge: number }).bulge)
    close(mr.x, -before.y); close(mr.y, before.x)
  })
})

describe('grille', () => {
  it('labels columns like a spreadsheet', () => {
    expect(colLabel(0)).toBe('A')
    expect(colLabel(25)).toBe('Z')
    expect(colLabel(26)).toBe('AA')
    expect(colIndex('AB')).toBe(27)
  })
  it('lays out a 300×250 wall with 50 cm cells from bottom-left', () => {
    const l = gridLayout({ w: 300, h: 250 }, { step: 50, origin: 'bl', snapStep: 5, show: true })
    expect(l.cols).toBe(6)
    expect(l.rows).toBe(5)
    const a1 = l.cells.find((c) => c.id === 'A1')!
    expect(a1).toMatchObject({ x: 0, y: 200, w: 50, h: 50 })
    expect(l.hLines.map((h) => h.cote)).toEqual([0, 50, 100, 150, 200, 250])
    expect(l.hLines[0].pos).toBe(250)
  })
  it('handles a partial last cell', () => {
    const l = gridLayout({ w: 320, h: 250 }, { step: 50, origin: 'tl', snapStep: 5, show: true })
    expect(l.cols).toBe(7)
    expect(l.vLines.at(-1)!.cote).toBe(320)
    const g1 = l.cells.find((c) => c.id === 'G1')!
    expect(g1.w).toBe(20)
    expect(g1.y).toBe(0)
  })
  it('origin bottom-right mirrors columns', () => {
    const l = gridLayout({ w: 300, h: 250 }, { step: 50, origin: 'br', snapStep: 5, show: true })
    expect(l.cells.find((c) => c.id === 'A1')).toMatchObject({ x: 250, y: 200 })
    expect(toGridCoords({ w: 300, h: 250 }, { step: 50, origin: 'br', snapStep: 5, show: true }, { x: 280, y: 240 })).toEqual({ x: 20, y: 10 })
  })
})
