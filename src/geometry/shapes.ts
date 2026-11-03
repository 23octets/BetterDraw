import type { Segment, Shape, Vec } from '../model/types'
import {
  add, applyMat, cross, dist, dot, len, lerp, matDet, mid, mul, norm, perp, sub, distToSegment,
  type Mat,
} from './vec'

export function segCount(s: Shape) {
  return s.closed ? s.pts.length : s.pts.length - 1
}

export function segEnds(s: Shape, i: number): [Vec, Vec] {
  return [s.pts[i], s.pts[(i + 1) % s.pts.length]]
}

/** Point milieu de l'arc défini par un bulge. */
export function arcMidPoint(p0: Vec, p1: Vec, bulge: number): Vec {
  const c = dist(p0, p1)
  const n = norm(perp(sub(p1, p0)))
  return add(mid(p0, p1), mul(n, (bulge * c) / 2))
}

export function arcGeometry(p0: Vec, p1: Vec, bulge: number) {
  const c = dist(p0, p1)
  const s = (bulge * c) / 2
  const r = (c * c) / 4 / (2 * Math.abs(s)) + Math.abs(s) / 2
  const m = arcMidPoint(p0, p1, bulge)
  const n = norm(perp(sub(p1, p0)))
  // centre : depuis le milieu de l'arc, recule de r le long de n (côté signe de s)
  const center = sub(m, mul(n, Math.sign(s) * r))
  const sweep = 4 * Math.atan(bulge)
  return { radius: r, center, mid: m, sweep }
}

/** Calcule le bulge d'un arc passant par p0, t (point de passage) et p1. */
export function bulgeFromThrough(p0: Vec, p1: Vec, t: Vec): number {
  const c = dist(p0, p1)
  if (c < 1e-9) return 0
  const n = norm(perp(sub(p1, p0)))
  const m = mid(p0, p1)
  const side = dot(sub(t, m), n)
  const cr = cross(sub(t, p0), sub(p1, p0))
  if (Math.abs(cr) < 1e-9 * c * c) return 0
  const center = circumcenter(p0, p1, t)
  if (!center) return 0
  const r = dist(center, p0)
  const d = dot(sub(center, m), n)
  const cand = [d + r, d - r]
  const s = cand.find((x) => Math.sign(x) === Math.sign(side)) ?? cand[0]
  return (2 * s) / c
}

export function circumcenter(a: Vec, b: Vec, c: Vec): Vec | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-12) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  }
}

/** Bulge d'un arc partant de p0 avec la tangente u et arrivant en p1. */
export function tangentArcBulge(p0: Vec, u: Vec, p1: Vec): number {
  const ch = sub(p1, p0)
  if (len(ch) < 1e-9 || len(u) < 1e-9) return 0
  const a = Math.atan2(cross(u, ch), dot(u, ch))
  return -Math.tan(a / 2)
}

/** Tangente (direction) au début du segment i. */
export function segStartTangent(s: Shape, i: number): Vec {
  const [p0, p1] = segEnds(s, i)
  const g = s.segs[i]
  if (g.t === 'cubic') {
    const d = sub(g.c1, p0)
    return len(d) > 1e-9 ? norm(d) : norm(sub(p1, p0))
  }
  const ch = norm(sub(p1, p0))
  if (g.t === 'arc') {
    const a = -2 * Math.atan(g.bulge)
    return rotate(ch, -a)
  }
  return ch
}

/** Tangente à la fin du segment i. */
export function segEndTangent(s: Shape, i: number): Vec {
  const [p0, p1] = segEnds(s, i)
  const g = s.segs[i]
  if (g.t === 'cubic') {
    const d = sub(p1, g.c2)
    return len(d) > 1e-9 ? norm(d) : norm(sub(p1, p0))
  }
  const ch = norm(sub(p1, p0))
  if (g.t === 'arc') {
    const a = -2 * Math.atan(g.bulge)
    return rotate(ch, a)
  }
  return ch
}

function rotate(p: Vec, a: number): Vec {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** Point sur le segment i au paramètre t ∈ [0,1]. */
export function segPoint(s: Shape, i: number, t: number): Vec {
  const [p0, p1] = segEnds(s, i)
  const g = s.segs[i]
  if (g.t === 'line') return lerp(p0, p1, t)
  if (g.t === 'cubic') {
    const u = 1 - t
    return {
      x: u * u * u * p0.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * p1.y,
    }
  }
  if (Math.abs(g.bulge) < 1e-9) return lerp(p0, p1, t)
  const { center, radius, sweep, mid: m } = arcGeometry(p0, p1, g.bulge)
  const a0 = Math.atan2(p0.y - center.y, p0.x - center.x)
  const half = Math.abs(sweep) / 2
  // sens de parcours : celui qui passe par le point milieu de l'arc
  const cand = (d: number) => ({ x: center.x + radius * Math.cos(a0 + d * half), y: center.y + radius * Math.sin(a0 + d * half) })
  const dir = dist(cand(1), m) < dist(cand(-1), m) ? 1 : -1
  const a = a0 + dir * Math.abs(sweep) * t
  return { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) }
}

/** Discrétisation d'une forme en polyligne (pour hit-test, aperçu, export). */
export function flatten(s: Shape, steps = 24): Vec[] {
  const out: Vec[] = []
  const n = segCount(s)
  for (let i = 0; i < n; i++) {
    const g = s.segs[i]
    const k = g.t === 'line' ? 1 : steps
    for (let j = i === 0 ? 0 : 1; j <= k; j++) out.push(segPoint(s, i, j / k))
  }
  if (n === 0 && s.pts.length) out.push(s.pts[0])
  return out
}

export function segFlatten(s: Shape, i: number, steps = 24): Vec[] {
  const g = s.segs[i]
  const k = g.t === 'line' ? 1 : steps
  const out: Vec[] = []
  for (let j = 0; j <= k; j++) out.push(segPoint(s, i, j / k))
  return out
}

export function distToShape(p: Vec, s: Shape): number {
  const pts = flatten(s)
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]))
  if (pts.length === 1) best = dist(p, pts[0])
  return best
}

export function distToSeg(p: Vec, s: Shape, i: number): number {
  const pts = segFlatten(s, i)
  let best = Infinity
  for (let k = 0; k < pts.length - 1; k++) best = Math.min(best, distToSegment(p, pts[k], pts[k + 1]))
  return best
}

const f = (n: number) => +n.toFixed(3)

function segD(p0: Vec, p1: Vec, g: Segment): string {
  if (g.t === 'line' || (g.t === 'arc' && Math.abs(g.bulge) < 1e-9)) return `L${f(p1.x)} ${f(p1.y)}`
  if (g.t === 'cubic') return `C${f(g.c1.x)} ${f(g.c1.y)} ${f(g.c2.x)} ${f(g.c2.y)} ${f(p1.x)} ${f(p1.y)}`
  const { radius, mid: m } = arcGeometry(p0, p1, g.bulge)
  const large = Math.abs(g.bulge) > 1 ? 1 : 0
  const sweep = cross(sub(m, p0), sub(p1, m)) > 0 ? 1 : 0
  return `A${f(radius)} ${f(radius)} 0 ${large} ${sweep} ${f(p1.x)} ${f(p1.y)}`
}

export function shapeToD(s: Shape): string {
  if (!s.pts.length) return ''
  let d = `M${f(s.pts[0].x)} ${f(s.pts[0].y)}`
  const n = segCount(s)
  for (let i = 0; i < n; i++) {
    const [p0, p1] = segEnds(s, i)
    d += segD(p0, p1, s.segs[i])
  }
  if (s.closed) d += 'Z'
  return d
}

export function transformShape(s: Shape, m: Mat): Shape {
  const flip = matDet(m) < 0
  return {
    ...s,
    pts: s.pts.map((p) => applyMat(m, p)),
    segs: s.segs.map((g) => {
      if (g.t === 'cubic') return { t: 'cubic', c1: applyMat(m, g.c1), c2: applyMat(m, g.c2) }
      if (g.t === 'arc') return { t: 'arc', bulge: flip ? -g.bulge : g.bulge }
      return g
    }),
  }
}

export function shapeBounds(shapes: Shape[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of shapes) {
    for (const p of flatten(s, 12)) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
    }
  }
  return { x0, y0, x1, y1 }
}

export function shapeLength(s: Shape): number {
  const pts = flatten(s, 64)
  let l = 0
  for (let i = 0; i < pts.length - 1; i++) l += dist(pts[i], pts[i + 1])
  return l
}
