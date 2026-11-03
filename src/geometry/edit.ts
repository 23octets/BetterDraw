import { nanoid } from 'nanoid'
import type { Segment, Shape, Vec } from '../model/types'
import { add, sub, mul, lerp, len, dot, type Mat } from './vec'
import { arcGeometry, bulgeFromThrough, segCount, segEndTangent, segStartTangent, shapeBounds, transformShape, flatten } from './shapes'

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

/** Points de contrôle équivalents d'un segment (droite ou arc convertis en cubique). */
export function segAsCubic(s: Shape, i: number): { c1: Vec; c2: Vec } {
  const p0 = s.pts[i]
  const p1 = s.pts[(i + 1) % s.pts.length]
  const g = s.segs[i]
  if (g.t === 'cubic') return { c1: g.c1, c2: g.c2 }
  if (g.t === 'arc' && Math.abs(g.bulge) > 1e-9) {
    const { radius, sweep } = arcGeometry(p0, p1, g.bulge)
    const k = (4 / 3) * Math.tan(Math.abs(sweep) / 4) * radius
    const t0 = segStartTangent(s, i)
    const t1 = segEndTangent(s, i)
    return { c1: add(p0, mul(t0, k)), c2: sub(p1, mul(t1, k)) }
  }
  return { c1: lerp(p0, p1, 1 / 3), c2: lerp(p0, p1, 2 / 3) }
}

/** Index du segment et poignée opposée au même sommet (pour garder un point lisse). */
export function oppositeControl(s: Shape, i: number, which: 'c1' | 'c2'): { i: number; which: 'c1' | 'c2' } | null {
  const n = segCount(s)
  if (which === 'c1') {
    const j = i - 1 >= 0 ? i - 1 : s.closed ? n - 1 : -1
    return j >= 0 ? { i: j, which: 'c2' } : null
  }
  const j = i + 1 < n ? i + 1 : s.closed ? 0 : -1
  return j >= 0 ? { i: j, which: 'c1' } : null
}

/**
 * Déplace une poignée de courbe. Une droite ou un arc devient une courbe de Bézier (forme conservée).
 * Si le sommet est lisse (poignées alignées), la poignée opposée tourne avec (sauf `breakSmooth`).
 */
export function moveControl(s: Shape, i: number, which: 'c1' | 'c2', p: Vec, breakSmooth = false): Shape {
  const n = segCount(s)
  const vi = which === 'c1' ? i : (i + 1) % s.pts.length
  const V = s.pts[vi]
  const segs = [...s.segs]
  const cur = segAsCubic(s, i)
  segs[i] = { t: 'cubic', c1: which === 'c1' ? p : cur.c1, c2: which === 'c2' ? p : cur.c2 }
  const opp = oppositeControl(s, i, which)
  if (!breakSmooth && opp && opp.i < n && s.segs[opp.i].t === 'cubic') {
    const og = s.segs[opp.i] as Extract<Segment, { t: 'cubic' }>
    const before = which === 'c1' ? sub(cur.c1, V) : sub(cur.c2, V)
    const oppVec = sub(og[opp.which], V)
    const lb = len(before), lo = len(oppVec)
    // lisse si les deux poignées sont opposées (à ~3° près)
    if (lb > 1e-6 && lo > 1e-6 && dot(before, oppVec) / (lb * lo) < -Math.cos((3 * Math.PI) / 180)) {
      const nv = sub(p, V)
      const ln = len(nv)
      if (ln > 1e-6) {
        const np = sub(V, mul(nv, lo / ln))
        segs[opp.i] = { ...og, [opp.which]: np }
      }
    }
  }
  return { ...s, segs }
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
