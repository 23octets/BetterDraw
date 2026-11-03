import type { Segment, Shape, Vec } from '../model/types'
import { dist, dot, cross } from './vec'
import { segCount, segEndTangent, segPoint, segStartTangent, tangentArcBulge } from './shapes'
import { splitSegment } from './trim'

/** Fait tourner une forme fermée pour que le sommet `k` devienne le sommet 1. */
function rotateClosed(s: Shape, k: number): Shape {
  const n = s.pts.length
  const shift = (((k - 1) % n) + n) % n
  return { ...s, pts: [...s.pts.slice(shift), ...s.pts.slice(0, shift)], segs: [...s.segs.slice(shift), ...s.segs.slice(0, shift)] }
}

/** Paramètre t du segment i où la distance (à vol d'oiseau) au sommet V vaut d, en partant de l'extrémité `from`. */
function tAtDistance(s: Shape, i: number, V: Vec, d: number, from: 'start' | 'end'): number {
  let lo = 0, hi = 1
  for (let it = 0; it < 50; it++) {
    const m = (lo + hi) / 2
    const t = from === 'start' ? m : 1 - m
    if (dist(segPoint(s, i, t), V) < d) lo = m
    else hi = m
  }
  const m = (lo + hi) / 2
  return from === 'start' ? m : 1 - m
}

/** Angle de virage au sommet vi (0 = tout droit). */
export function cornerAngle(s: Shape, vi: number): number | null {
  const n = segCount(s)
  const a = vi - 1 >= 0 ? vi - 1 : s.closed ? n - 1 : -1
  const b = vi < n ? vi : -1
  if (a < 0 || b < 0 || (!s.closed && (vi === 0 || vi === s.pts.length - 1))) return null
  const tin = segEndTangent(s, a)
  const tout = segStartTangent(s, b)
  return Math.atan2(Math.abs(cross(tin, tout)), dot(tin, tout))
}

/**
 * Arrondit le sommet vi par un arc de cercle tangent aux deux côtés.
 * `radius` en cm ; s'il est trop grand pour les segments voisins, il est réduit.
 * Renvoie null si le sommet est une extrémité ou déjà dans le prolongement.
 */
export function filletVertex(s0: Shape, vi: number, radius?: number): Shape | null {
  const theta = cornerAngle(s0, vi)
  if (theta === null || theta < (2 * Math.PI) / 180) return null
  const s = s0.closed ? rotateClosed(s0, vi) : s0
  const v = s0.closed ? 1 : vi
  const a = v - 1
  const b = v
  const V = s.pts[v]
  const [pa, pb] = [s.pts[a], s.pts[(b + 1) % s.pts.length]]
  const maxD = 0.45 * Math.min(dist(pa, V), dist(V, pb))
  let d = radius !== undefined ? radius * Math.tan(theta / 2) : maxD * 0.6
  d = Math.min(d, maxD)
  if (d < 1e-3) return null
  const ta = tAtDistance(s, a, V, d, 'end')
  const tb = tAtDistance(s, b, V, d, 'start')
  const A = splitSegment(pa, V, s.segs[a], ta)
  const B = splitSegment(V, pb, s.segs[b], tb)
  const P1 = A.m
  const P2 = B.m
  const tmp: Shape = { id: '', pts: [pa, P1], segs: [A.a], closed: false }
  const bulge = tangentArcBulge(P1, segEndTangent(tmp, 0), P2)
  const arc: Segment = { t: 'arc', bulge }
  const pts = [...s.pts.slice(0, v), P1, P2, ...s.pts.slice(v + 1)]
  const segs = [...s.segs.slice(0, a), A.a, arc, B.b, ...s.segs.slice(b + 1)]
  return { ...s0, pts, segs }
}

/** Arrondit tous les angles d'une forme avec le même rayon. */
export function filletAll(s: Shape, radius: number): Shape {
  let cur = s
  // on retrouve chaque sommet d'origine par sa position (les indices bougent à chaque arrondi)
  for (const T of s.pts) {
    const vi = cur.pts.findIndex((p) => dist(p, T) < 1e-9)
    if (vi < 0) continue
    const r = filletVertex(cur, vi, radius)
    if (r) cur = r
  }
  return cur
}
