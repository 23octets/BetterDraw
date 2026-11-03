import { nanoid } from 'nanoid'
import type { Segment, Shape, Vec } from '../model/types'
import { add, sub, type Mat } from './vec'
import { bulgeFromThrough, segCount, shapeBounds, transformShape, flatten } from './shapes'

/** Déplace un sommet ; les poignées de Bézier adjacentes suivent. */
export function moveVertex(s: Shape, i: number, p: Vec): Shape {
  const delta = sub(p, s.pts[i])
  const pts = s.pts.map((q, k) => (k === i ? p : q))
  const n = segCount(s)
  const segs = s.segs.map((g, k): Segment => {
    if (g.t !== 'cubic') return g
    const startsHere = k === i
    const endsHere = (k + 1) % s.pts.length === i && k < n
    return {
      t: 'cubic',
      c1: startsHere ? add(g.c1, delta) : g.c1,
      c2: endsHere ? add(g.c2, delta) : g.c2,
    }
  })
  return { ...s, pts, segs }
}

/** Courbe le segment i pour qu'il passe par `through` (transforme une droite en arc). */
export function bendSegment(s: Shape, i: number, through: Vec): Shape {
  const p0 = s.pts[i]
  const p1 = s.pts[(i + 1) % s.pts.length]
  const bulge = bulgeFromThrough(p0, p1, through)
  const segs = s.segs.map((g, k): Segment => (k === i ? (Math.abs(bulge) < 1e-3 ? { t: 'line' } : { t: 'arc', bulge }) : g))
  return { ...s, segs }
}

export function setSegmentType(s: Shape, i: number, type: Segment['t']): Shape {
  const p0 = s.pts[i]
  const p1 = s.pts[(i + 1) % s.pts.length]
  const seg: Segment =
    type === 'line'
      ? { t: 'line' }
      : type === 'arc'
        ? { t: 'arc', bulge: Math.tan(Math.PI / 8) }
        : { t: 'cubic', c1: add(p0, { x: (p1.x - p0.x) / 3, y: (p1.y - p0.y) / 3 - 10 }), c2: add(p0, { x: ((p1.x - p0.x) * 2) / 3, y: ((p1.y - p0.y) * 2) / 3 - 10 }) }
  return { ...s, segs: s.segs.map((g, k) => (k === i ? seg : g)) }
}

export function moveControl(s: Shape, i: number, which: 'c1' | 'c2', p: Vec): Shape {
  return {
    ...s,
    segs: s.segs.map((g, k): Segment => (k === i && g.t === 'cubic' ? { ...g, [which]: p } : g)),
  }
}

export function translateShapes(shapes: Shape[], d: Vec): Shape[] {
  return shapes.map((s) => transformShape(s, [1, 0, 0, 1, d.x, d.y] as Mat))
}

export function selectionCenter(shapes: Shape[]): Vec {
  const b = shapeBounds(shapes)
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
}

export function cloneShapes(shapes: Shape[], offset: Vec): Shape[] {
  return translateShapes(shapes, offset).map((s) => ({ ...s, id: nanoid(10) }))
}

export function shapesInRect(shapes: Shape[], a: Vec, b: Vec): string[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
  return shapes
    .filter((s) => flatten(s, 8).every((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1))
    .map((s) => s.id)
}

/** Ferme ou ouvre une forme. */
export function toggleClosed(s: Shape): Shape {
  if (s.closed) return { ...s, closed: false, segs: s.segs.slice(0, s.pts.length - 1) }
  if (s.pts.length < 3) return s
  return { ...s, closed: true, segs: [...s.segs, { t: 'line' }] }
}
