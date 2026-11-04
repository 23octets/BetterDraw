import { defaultDoc } from '../model/defaults'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as repo from './repo'
import { flushPersistence, useEditor } from './editor'
import { eraseAt, fillAt, resolveFills, surfaces, colorAt } from './fills'
import type { Shape } from '../model/types'

const line = (id: string, a: [number, number], b: [number, number]): Shape => ({ id, pts: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], segs: [{ t: 'line' }], closed: false })

beforeEach(async () => {
  await flushPersistence()
  await db.delete()
  await db.open()
  const { variant } = await repo.createProject('Peinture', { w: 300, h: 200 })
  await useEditor.getState().load(variant.id)
})

function paint(x: number, y: number, colorIdx = 0) {
  const st = useEditor.getState()
  const res = fillAt(st.doc, { x, y }, st.doc.palette[colorIdx].id)!
  st.commit('peindre', (d) => { d.fills = res.fills })
}

describe('remplissage', () => {
  it('paints the zone left of a line and computes its surface', () => {
    useEditor.getState().commit('ligne', (d) => { d.shapes.push(line('a', [100, 0], [100, 200])) })
    paint(50, 50)
    const doc = useEditor.getState().doc
    const r = resolveFills(doc)
    expect(r).toHaveLength(1)
    expect(r[0].region.area).toBeCloseTo(20000)
    const s = surfaces(doc)
    expect(s.colors[0].area).toBeCloseTo(20000)
    // 2 m² × 2 couches / 10 m²/L = 0.4 L
    expect(s.colors[0].liters).toBeCloseTo(0.4)
    expect(s.background.area).toBeCloseTo(40000)
    expect(colorAt(doc, { x: 20, y: 20 })).toBe(doc.palette[0].id)
    expect(colorAt(doc, { x: 220, y: 20 })).toBeNull()
  })

  it('repainting a zone replaces its color', () => {
    useEditor.getState().commit('ligne', (d) => { d.shapes.push(line('a', [100, 0], [100, 200])) })
    paint(50, 50, 0)
    paint(60, 60, 1)
    const doc = useEditor.getState().doc
    expect(resolveFills(doc)).toHaveLength(1)
    expect(resolveFills(doc)[0].fill.colorId).toBe(doc.palette[1].id)
  })

  it('the color follows when the border moves', () => {
    useEditor.getState().commit('ligne', (d) => { d.shapes.push(line('a', [100, 0], [100, 200])) })
    paint(50, 50)
    useEditor.getState().commit('déplacer', (d) => {
      d.shapes[0] = line('a', [150, 0], [150, 200])
    })
    const r = resolveFills(useEditor.getState().doc)
    expect(r).toHaveLength(1)
    expect(r[0].region.area).toBeCloseTo(30000)
  })

  it('a zone cut in two keeps its color on both sides', () => {
    useEditor.getState().commit('ligne', (d) => { d.shapes.push(line('a', [100, 0], [100, 200])) })
    paint(50, 50)
    useEditor.getState().commit('couper', (d) => { d.shapes.push(line('b', [0, 100], [100, 100])) })
    const r = resolveFills(useEditor.getState().doc)
    expect(r).toHaveLength(2)
    expect(r.map((x) => Math.round(x.region.area)).sort()).toEqual([10000, 10000])
  })

  it('undo restores the previous fills', async () => {
    useEditor.getState().commit('ligne', (d) => { d.shapes.push(line('a', [100, 0], [100, 200])) })
    paint(50, 50)
    useEditor.getState().commit('couper', (d) => { d.shapes.push(line('b', [0, 100], [100, 100])) })
    await useEditor.getState().undo()
    expect(resolveFills(useEditor.getState().doc)).toHaveLength(1)
    await flushPersistence()
  })

  it('erasing removes the color of a zone', () => {
    useEditor.getState().commit('ligne', (d) => { d.shapes.push(line('a', [100, 0], [100, 200])) })
    paint(50, 50)
    const fills = eraseAt(useEditor.getState().doc, { x: 50, y: 50 })!
    expect(fills).toHaveLength(0)
    expect(eraseAt(useEditor.getState().doc, { x: 250, y: 50 })).toBeNull()
  })

  it('a zone that disappears loses its color', () => {
    const sq: Shape = { id: 's', closed: true, pts: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }], segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }] }
    useEditor.getState().commit('carré', (d) => { d.shapes.push(sq) })
    paint(30, 30)
    useEditor.getState().commit('supprimer', (d) => { d.shapes = [] })
    expect(resolveFills(useEditor.getState().doc)).toHaveLength(0)
  })
})

describe('transport des couleurs', () => {
  it('moving a painted closed shape carries its color', async () => {
    const { setPendingCarry } = await import('./fills')
    const sq: Shape = { id: 's', closed: true, pts: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }], segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }] }
    useEditor.getState().commit('carré', (d) => { d.shapes.push(sq) })
    paint(30, 30)
    paint(150, 150, 1) // le fond autour
    setPendingCarry({ ids: new Set(['s']), m: [1, 0, 0, 1, 200, 100] })
    useEditor.getState().commit('déplacer', (d) => {
      d.shapes[0].pts = d.shapes[0].pts.map((p) => ({ x: p.x + 200, y: p.y + 100 }))
    })
    const doc = useEditor.getState().doc
    expect(colorAt(doc, { x: 230, y: 130 })).toBe(doc.palette[0].id)
    expect(colorAt(doc, { x: 30, y: 30 })).toBe(doc.palette[1].id)
  })
})

describe('suppression d’un trait qui découpait une zone peinte', () => {
  it('les morceaux de même couleur refondus gardent leur couleur', () => {
    // bande horizontale peinte, coupée par 3 traits verticaux en 4 morceaux de même couleur
    useEditor.getState().commit('bande', (d) => {
      d.shapes.push(line('h1', [0, 60], [300, 60]), line('h2', [0, 140], [300, 140]))
    })
    useEditor.getState().commit('coupes', (d) => {
      d.shapes.push(line('c', [20, 20], [280, 180]))
    })
    // peindre les morceaux de la bande en vert (index 3), le haut en ocre (index 2)
    for (const [x, y] of [[30, 100], [150, 120], [270, 80], [150, 75]] as [number, number][]) paint(x, y, 3)
    paint(150, 20, 2)
    const st = useEditor.getState()
    const green = st.doc.palette[3].id
    expect(colorAt(st.doc, { x: 150, y: 100 })).toBe(green)
    // supprimer le trait qui coupait la bande
    useEditor.getState().commit('supprimer', (d) => { d.shapes = d.shapes.filter((s) => s.id !== 'c') })
    const doc = useEditor.getState().doc
    expect(colorAt(doc, { x: 150, y: 100 })).toBe(green)
    expect(colorAt(doc, { x: 20, y: 100 })).toBe(green)
    expect(colorAt(doc, { x: 150, y: 20 })).toBe(doc.palette[2].id)
  })
})

it('déduit une seule fois les ouvertures et vides, dans les aplats comme dans le fond', () => {
  const doc = defaultDoc()
  doc.shapes = [{ id: 's', pts: [{ x: 100, y: 0 }, { x: 100, y: 250 }], segs: [{ t: 'line' }], closed: false }]
  doc.fills = fillAt(doc, { x: 20, y: 20 }, doc.palette[0].id)!.fills
  const room = { openings: [{ id: 'f', wallId: 'w', kind: 'window' as const, x: 40, w: 80, h: 100, sill: 70 }], masks: [{ x: 90, y: 80, w: 40, h: 100 }] }
  const plain = surfaces(doc), net = surfaces(doc, room)
  expect(plain.total).toBe(75000)
  expect(net.total).toBe(66000)
  expect(net.colors[0].area).toBe(19000)
  expect(net.background.area).toBe(47000)
  expect(net.colors[0].liters).toBeCloseTo(1.9 * doc.paint.coats / doc.paint.coverage)
  expect(net.background.liters).toBeCloseTo(4.7 * doc.paint.coats / doc.paint.coverage)
})
