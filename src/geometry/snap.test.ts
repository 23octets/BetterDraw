import { describe, expect, it } from 'vitest'
import { constrainAngle, parseLengthInput, snapPoint } from './snap'
import { defaultDoc } from '../model/defaults'
import type { DocState } from '../model/types'
import { nextSegment } from '../tools/polyline'
import { nodesToShape } from '../tools/bezier'
import { measureText } from '../tools/measure'
import { arcMidPoint } from './shapes'

function docWith(): DocState {
  const d = defaultDoc()
  d.shapes = [
    { id: 'h', pts: [{ x: 0, y: 100 }, { x: 200, y: 100 }], segs: [{ t: 'line' }], closed: false },
    { id: 'v', pts: [{ x: 100, y: 0 }, { x: 100, y: 200 }], segs: [{ t: 'line' }], closed: false },
  ]
  return d
}

describe('aimantage', () => {
  it('snaps to endpoints first', () => {
    expect(snapPoint(docWith(), { x: 198, y: 101 }, { radius: 5 })).toMatchObject({ kind: 'extrémité', p: { x: 200, y: 100 } })
  })
  it('snaps to intersections', () => {
    const r = snapPoint(docWith(), { x: 102, y: 98 }, { radius: 5 })
    expect(r.kind).toBe('intersection')
    expect(r.p.x).toBeCloseTo(100)
    expect(r.p.y).toBeCloseTo(100)
  })
  it('snaps onto a line (T junction)', () => {
    const r = snapPoint(docWith(), { x: 152.3, y: 101.5 }, { radius: 5 })
    expect(r.kind).toBe('sur le trait')
    expect(r.p.y).toBeCloseTo(100)
    expect(r.p.x).toBeCloseTo(152.3)
  })
  it('falls back to the fine grid', () => {
    expect(snapPoint(docWith(), { x: 31.2, y: 43.9 }, { radius: 2 })).toMatchObject({ kind: 'grille', p: { x: 30, y: 45 } })
  })
  it('snaps to wall corners and edges', () => {
    expect(snapPoint(defaultDoc(), { x: 298, y: 2 }, { radius: 5 })).toMatchObject({ kind: 'coin', p: { x: 300, y: 0 } })
    expect(snapPoint(defaultDoc(), { x: 151.7, y: 248 }, { radius: 5 })).toMatchObject({ kind: 'bord du mur', p: { x: 150, y: 250 } })
  })
  it('can be disabled (Alt)', () => {
    expect(snapPoint(docWith(), { x: 198, y: 101 }, { radius: 5, disabled: true })).toMatchObject({ kind: 'libre', p: { x: 198, y: 101 } })
  })
  it('constrains to 45° with Shift', () => {
    const p = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 7 }, 5)
    expect(p).toEqual({ x: 100, y: 0 })
    const q = constrainAngle({ x: 0, y: 0 }, { x: 50, y: 52 }, 0)
    expect(q.x).toBeCloseTo(q.y)
  })
})

describe('saisie numérique', () => {
  it('uses the cursor direction', () => {
    const p = parseLengthInput('120', { x: 10, y: 10 }, { x: 10, y: 500 })!
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(130)
  })
  it('accepts an angle (counter-clockwise, 0° to the right)', () => {
    const p = parseLengthInput('100<90', { x: 0, y: 200 }, { x: 0, y: 0 })!
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(100)
    expect(parseLengthInput('12,5', { x: 0, y: 0 }, { x: 1, y: 0 })!.x).toBeCloseTo(12.5)
    expect(parseLengthInput('abc', { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull()
  })
})

describe('outils', () => {
  it('polyline arc mode is tangent to the previous segment', () => {
    const d = { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], segs: [{ t: 'line' as const }], arcMode: true }
    const seg = nextSegment(d, { x: 200, y: 100 })
    expect(seg.t).toBe('arc')
    const m = arcMidPoint({ x: 100, y: 0 }, { x: 200, y: 100 }, (seg as { bulge: number }).bulge)
    // quart de cercle de centre (100, 100)
    expect(Math.hypot(m.x - 100, m.y - 100)).toBeCloseTo(100)
  })
  it('pen nodes build lines and cubics', () => {
    const s = nodesToShape([
      { p: { x: 0, y: 0 }, out: { x: 0, y: 0 } },
      { p: { x: 10, y: 0 }, out: { x: 0, y: 0 } },
      { p: { x: 20, y: 10 }, out: { x: 5, y: 0 } },
    ], true)
    expect(s.segs.map((g) => g.t)).toEqual(['line', 'cubic', 'cubic'])
    expect(s.closed).toBe(true)
  })
  it('measure text gives distance, deltas and angle', () => {
    const t = measureText({ x: 0, y: 100 }, { x: 30, y: 60 })
    expect(t.main).toBe('50 cm')
    expect(t.detail).toContain('↔ 30 cm')
    expect(t.detail).toContain('↕ 40 cm')
    expect(t.detail).toContain('53.1°')
  })
})
