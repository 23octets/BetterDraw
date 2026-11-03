import { nanoid } from 'nanoid'
import type { DocState, Segment, Shape, Vec } from '../model/types'
import { lerp, dist } from './vec'
import { segCount, segEnds, segPoint } from './shapes'
import { getPaper, toPaperPath } from './paperScope'

/** Découpe un segment au paramètre t : renvoie les deux moitiés et le point de coupe. */
export function splitSegment(p0: Vec, p1: Vec, g: Segment, t: number): { a: Segment; b: Segment; m: Vec } {
  if (g.t === 'line') return { a: g, b: g, m: lerp(p0, p1, t) }
  if (g.t === 'arc') {
    const tmp: Shape = { id: '', pts: [p0, p1], segs: [g], closed: false }
    const m = segPoint(tmp, 0, t)
    const sweep = 4 * Math.atan(g.bulge)
    return { a: { t: 'arc', bulge: Math.tan((sweep * t) / 4) }, b: { t: 'arc', bulge: Math.tan((sweep * (1 - t)) / 4) }, m }
  }
  // de Casteljau
  const q0 = lerp(p0, g.c1, t), q1 = lerp(g.c1, g.c2, t), q2 = lerp(g.c2, p1, t)
  const r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t)
  const m = lerp(r0, r1, t)
  return { a: { t: 'cubic', c1: q0, c2: r0 }, b: { t: 'cubic', c1: r1, c2: q2 }, m }
}

/** Morceau du segment i entre ta et tb (0 ≤ ta < tb ≤ 1). */
function segPiece(s: Shape, i: number, ta: number, tb: number): { p0: Vec; p1: Vec; seg: Segment } {
  let [p0, p1] = segEnds(s, i)
  let g = s.segs[i]
  if (tb < 1 - 1e-9) {
    const r = splitSegment(p0, p1, g, tb)
    p1 = r.m
    g = r.a
  }
  if (ta > 1e-9) {
    const r = splitSegment(p0, p1, g, ta / tb)
    p0 = r.m
    g = r.b
  }
  return { p0, p1, seg: g }
}

/**
 * Sous-tracé entre les paramètres globaux u0 < u1 (u = indice de segment + t).
 * Pour une forme fermée, u1 peut dépasser le nombre de segments (on fait le tour).
 */
export function subShape(s: Shape, u0: number, u1: number): Shape {
  const n = segCount(s)
  const pts: Vec[] = []
  const segs: Segment[] = []
  for (let k = Math.floor(u0); k < Math.ceil(u1 - 1e-9); k++) {
    const i = ((k % n) + n) % n
    const ta = Math.max(0, u0 - k)
    const tb = Math.min(1, u1 - k)
    if (tb - ta < 1e-9) continue
    const piece = segPiece(s, i, ta, tb)
    if (!pts.length) pts.push(piece.p0)
    pts.push(piece.p1)
    segs.push(piece.seg)
  }
  return { id: nanoid(10), pts, segs, closed: false }
}

/** Paramètre t du point du segment i le plus proche de p. */
export function nearestT(s: Shape, i: number, p: Vec): { t: number; d: number } {
  let best = 0
  let bd = Infinity
  const N = 64
  for (let k = 0; k <= N; k++) {
    const d = dist(segPoint(s, i, k / N), p)
    if (d < bd) {
      bd = d
      best = k / N
    }
  }
  let lo = Math.max(0, best - 1 / N), hi = Math.min(1, best + 1 / N)
  for (let it = 0; it < 40; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
    if (dist(segPoint(s, i, m1), p) < dist(segPoint(s, i, m2), p)) hi = m2
    else lo = m1
  }
  const t = (lo + hi) / 2
  return { t, d: dist(segPoint(s, i, t), p) }
}

export function nearestU(s: Shape, p: Vec): { u: number; d: number } {
  let best = { u: 0, d: Infinity }
  for (let i = 0; i < segCount(s); i++) {
    const r = nearestT(s, i, p)
    if (r.d < best.d) best = { u: i + r.t, d: r.d }
  }
  return best
}

function wallShape(wall: { w: number; h: number }): Shape {
  return {
    id: '__wall', closed: true,
    pts: [{ x: 0, y: 0 }, { x: wall.w, y: 0 }, { x: wall.w, y: wall.h }, { x: 0, y: wall.h }],
    segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }],
  }
}

/** Paramètres u où la forme est coupée par un autre trait (ou elle-même, ou le bord du mur). */
export function cutParams(doc: Pick<DocState, 'shapes' | 'wall'>, s: Shape): number[] {
  const P = getPaper()
  const path = toPaperPath(s)
  const points: Vec[] = []
  for (const loc of path.getIntersections()) points.push({ x: loc.point.x, y: loc.point.y })
  for (const other of [...doc.shapes.filter((o) => o.id !== s.id), wallShape(doc.wall)]) {
    const op = toPaperPath(other)
    for (const loc of path.getIntersections(op)) points.push({ x: loc.point.x, y: loc.point.y })
    // extrémités d'autres traits posées sur celui-ci (jonctions en T)
    if (!other.closed && other.pts.length) {
      for (const e of [other.pts[0], other.pts[other.pts.length - 1]]) {
        const q = path.getNearestPoint(new P.Point(e.x, e.y))
        if (q.getDistance(new P.Point(e.x, e.y)) < 0.05) points.push(e)
      }
    }
  }
  const n = segCount(s)
  const us: number[] = []
  for (const p of points) {
    const r = nearestU(s, p)
    if (r.d > 0.1) continue
    if (!s.closed && (r.u < 1e-4 || r.u > n - 1e-4)) continue
    if (!us.some((u) => Math.abs(u - r.u) < 1e-4)) us.push(r.u)
  }
  return us.sort((a, b) => a - b)
}

export interface TrimPlan {
  shapeId: string
  /** Morceau supprimé (pour l'aperçu). */
  removed: Shape
  /** Formes qui remplacent la forme coupée. */
  keep: Shape[]
}

/** Calcule la coupe du morceau de trait situé sous p, entre les intersections les plus proches. */
export function planTrim(doc: Pick<DocState, 'shapes' | 'wall'>, s: Shape, p: Vec): TrimPlan | null {
  const n = segCount(s)
  if (n === 0) return null
  const { u: uc } = nearestU(s, p)
  const cuts = cutParams(doc, s)
  if (!s.closed) {
    const a = Math.max(0, ...cuts.filter((u) => u < uc))
    const b = Math.min(n, ...cuts.filter((u) => u > uc))
    const keep: Shape[] = []
    if (a > 1e-6) keep.push(subShape(s, 0, a))
    if (b < n - 1e-6) keep.push(subShape(s, b, n))
    return { shapeId: s.id, removed: subShape(s, a, b), keep }
  }
  if (cuts.length < 2) return { shapeId: s.id, removed: { ...s }, keep: [] }
  const before = cuts.filter((u) => u < uc)
  const after = cuts.filter((u) => u > uc)
  const a = before.length ? before[before.length - 1] : cuts[cuts.length - 1] - n
  const b = after.length ? after[0] : cuts[0] + n
  return { shapeId: s.id, removed: subShape(s, a, b), keep: [subShape(s, b, a + n)] }
}
