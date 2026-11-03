import { describe, expect, it } from 'vitest'
import { buildRegions, regionAt, findGaps } from './regions'
import type { Shape } from '../model/types'
import { defaultDoc } from '../model/defaults'
import { getPaper } from './paperScope'

const line = (id: string, a: [number, number], b: [number, number]): Shape => ({ id, pts: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], segs: [{ t: 'line' }], closed: false })
const W = { w: 300, h: 200 }

describe('régions', () => {
  it('empty wall is a single region', () => {
    const g = buildRegions([], W)
    expect(g.faces).toHaveLength(1)
    expect(regionAt(g, { x: 10, y: 10 })!.area).toBeCloseTo(60000)
  })
  it('a vertical line splits the wall in two', () => {
    const g = buildRegions([line('a', [100, 0], [100, 200])], W)
    expect(g.faces).toHaveLength(2)
    expect(regionAt(g, { x: 50, y: 50 })!.area).toBeCloseTo(20000)
    expect(regionAt(g, { x: 250, y: 50 })!.area).toBeCloseTo(40000)
  })
  it('a cross inside a rectangle gives 4 zones', () => {
    const sq: Shape = { id: 's', closed: true, pts: [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }], segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }] }
    const g = buildRegions([sq, line('h', [50, 100], [150, 100]), line('v', [100, 50], [100, 150])], W)
    expect(regionAt(g, { x: 75, y: 75 })!.area).toBeCloseTo(2500)
    // le mur autour du carré est une région avec un trou
    expect(regionAt(g, { x: 10, y: 10 })!.area).toBeCloseTo(60000 - 10000)
  })
  it('a dangling line does not split a region', () => {
    const g = buildRegions([line('a', [100, 0], [100, 120])], W)
    expect(regionAt(g, { x: 50, y: 50 })!.area).toBeCloseTo(60000)
  })
  it('handles circles made of arcs and T-junctions', () => {
    const circle: Shape = { id: 'c', closed: true, pts: [{ x: 100, y: 100 }, { x: 200, y: 100 }], segs: [{ t: 'arc', bulge: 1 }, { t: 'arc', bulge: 1 }] }
    const g = buildRegions([circle, line('d', [100, 100], [200, 100])], W)
    const top = regionAt(g, { x: 150, y: 80 })!
    const bottom = regionAt(g, { x: 150, y: 120 })!
    expect(Math.abs(top.area - (Math.PI * 50 * 50) / 2)).toBeLessThan(5)
    expect(Math.abs(bottom.area - (Math.PI * 50 * 50) / 2)).toBeLessThan(5)
    // T : un trait qui part du bord du mur et s'arrête sur le diamètre
    const g2 = buildRegions([line('h', [0, 100], [300, 100]), line('v', [150, 0], [150, 100])], W)
    expect(regionAt(g2, { x: 10, y: 10 })!.area).toBeCloseTo(15000)
    expect(regionAt(g2, { x: 10, y: 150 })!.area).toBeCloseTo(30000)
  })
  it('detects a small gap', () => {
    const doc = defaultDoc()
    doc.wall = W
    // carré avec un trou de 2 cm dans un coin
    doc.shapes = [{ id: 's', closed: false, pts: [{ x: 52, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }, { x: 50, y: 52 }], segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }] }]
    const g = buildRegions(doc.shapes, W)
    const r = regionAt(g, { x: 100, y: 100 })!
    expect(r.area).toBeCloseTo(60000) // fuit sur tout le mur
    const gaps = findGaps(doc, r, g, 5)
    expect(gaps.length).toBeGreaterThan(0)
    expect(gaps[0].x).toBeCloseTo(51, 0)
  })
})

describe('îlots imbriqués', () => {
  it('a square inside a square inside the wall', () => {
    const sq = (id: string, x: number, y: number, w: number): Shape => ({ id, closed: true, pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + w }, { x, y: y + w }], segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }] })
    const g = buildRegions([sq('a', 20, 20, 160), sq('b', 60, 60, 40)], W)
    expect(regionAt(g, { x: 5, y: 5 })!.area).toBeCloseTo(60000 - 160 * 160)
    expect(regionAt(g, { x: 30, y: 30 })!.area).toBeCloseTo(160 * 160 - 40 * 40)
    expect(regionAt(g, { x: 70, y: 70 })!.area).toBeCloseTo(1600)
    // le point dans l'anneau est bien dans la région, pas celui dans le petit carré
    const ring = regionAt(g, { x: 30, y: 30 })!
    const P = getPaper()
    expect(ring.item.contains(new P.Point(30, 30))).toBe(true)
    expect(ring.item.contains(new P.Point(70, 70))).toBe(false)
  })
})
