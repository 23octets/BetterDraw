import { beforeEach, describe, expect, it } from 'vitest'
import type { Shape } from '../model/types'
import { clipShapeToWall } from './clip'
import { buildRegions, findGaps, regionAt } from './regions'
import { defaultDoc } from '../model/defaults'
import { db } from '../store/db'
import * as repo from '../store/repo'
import { flushPersistence, useEditor } from '../store/editor'

const wall = { w: 300, h: 200 }
const poly = (id: string, pts: [number, number][], closed = false): Shape => ({
  id, pts: pts.map(([x, y]) => ({ x, y })), segs: pts.slice(closed ? 0 : 1).map(() => ({ t: 'line' as const })), closed,
})

describe('découpage au bord du mur', () => {
  it('garde un trait entièrement dans le mur tel quel', () => {
    const s = poly('a', [[10, 10], [100, 100]])
    expect(clipShapeToWall(s, wall)).toEqual([s])
  })

  it('coupe un trait qui déborde des deux côtés exactement sur le bord', () => {
    const [c, ...rest] = clipShapeToWall(poly('a', [[-20, 100], [320, 100]]), wall)
    expect(rest).toHaveLength(0)
    expect(c.id).toBe('a')
    expect(c.pts).toEqual([{ x: 0, y: 100 }, { x: 300, y: 100 }])
  })

  it('coupe une ligne brisée qui sort puis rentre en deux morceaux', () => {
    const out = clipShapeToWall(poly('a', [[50, 50], [50, -50], [150, -50], [150, 50]]), wall)
    expect(out).toHaveLength(2)
    expect(out[0].pts).toEqual([{ x: 50, y: 50 }, { x: 50, y: 0 }])
    expect(out[1].pts).toEqual([{ x: 150, y: 0 }, { x: 150, y: 50 }])
  })

  it('ouvre une forme fermée qui déborde et retire une forme entièrement dehors', () => {
    const out = clipShapeToWall(poly('a', [[250, 50], [350, 50], [350, 150], [250, 150]], true), wall)
    expect(out).toHaveLength(1)
    expect(out[0].closed).toBe(false)
    expect(out[0].pts).toEqual([{ x: 300, y: 150 }, { x: 250, y: 150 }, { x: 250, y: 50 }, { x: 300, y: 50 }])
    expect(clipShapeToWall(poly('b', [[400, 50], [450, 50], [450, 100]], true), wall)).toEqual([])
  })

  it('coupe aussi un arc au bord', () => {
    const arc: Shape = { id: 'a', pts: [{ x: 100, y: 20 }, { x: 200, y: 20 }], segs: [{ t: 'arc', bulge: -1 }], closed: false }
    const out = clipShapeToWall(arc, wall)
    expect(out.length).toBe(2)
    for (const s of out) {
      expect(s.segs.every((g) => g.t === 'arc')).toBe(true)
      for (const p of s.pts) expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('la bordure ferme la zone : aucun trou signalé, même pour un ancien trait qui déborde', () => {
    const doc = { ...defaultDoc(), wall, shapes: [poly('a', [[-3, 100], [303, 120]])] }
    const g = buildRegions(doc.shapes, doc.wall)
    const r = regionAt(g, { x: 150, y: 20 })!
    expect(r).not.toBeNull()
    expect(findGaps(doc, r, g, 8)).toEqual([])
  })
})

describe('commit', () => {
  beforeEach(async () => {
    await flushPersistence()
    await db.delete()
    await db.open()
    const { variant } = await repo.createProject('Débord', wall)
    await useEditor.getState().load(variant.id)
  })

  it('coupe au bord un trait ajouté ou déplacé, sans toucher aux autres', () => {
    const st = useEditor.getState()
    st.commit('ligne', (d) => { d.shapes.push(poly('a', [[-10, 100], [100, 100]])) })
    expect(useEditor.getState().doc.shapes[0].pts[0]).toEqual({ x: 0, y: 100 })
    st.commit('ligne', (d) => { d.shapes.push(poly('b', [[10, 10], [20, 20]])) })
    const b = useEditor.getState().doc.shapes[1]
    st.commit('déplacer', (d) => { d.shapes[0].pts[1].x = 400 })
    const doc = useEditor.getState().doc
    expect(doc.shapes[0].pts[1]).toEqual({ x: 300, y: 100 })
    expect(doc.shapes[1]).toBe(b)
  })
})
