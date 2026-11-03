import type { Vec } from '../model/types'

export const v = (x: number, y: number): Vec => ({ x, y })
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x
export const len = (a: Vec) => Math.hypot(a.x, a.y)
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const norm = (a: Vec): Vec => {
  const l = len(a)
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}
/** Perpendiculaire (-y, x). */
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x })
export const eq = (a: Vec, b: Vec, eps = 1e-6) => dist(a, b) <= eps

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-12) return dist(p, a)
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  return dist(p, lerp(a, b, t))
}

export function closestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-12) return a
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  return lerp(a, b, t)
}

export function round(n: number, d = 1) {
  const k = 10 ** d
  return Math.round(n * k) / k
}

/** Affine 2D : [a, b, c, d, e, f] → x' = a x + c y + e ; y' = b x + d y + f */
export type Mat = [number, number, number, number, number, number]
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]
export const applyMat = (m: Mat, p: Vec): Vec => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })
export function matMul(m: Mat, n: Mat): Mat {
  // m ∘ n (applique n puis m)
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}
export const translateMat = (dx: number, dy: number): Mat => [1, 0, 0, 1, dx, dy]
export function rotateMat(angle: number, c: Vec): Mat {
  const cs = Math.cos(angle)
  const sn = Math.sin(angle)
  return matMul(translateMat(c.x, c.y), matMul([cs, sn, -sn, cs, 0, 0], translateMat(-c.x, -c.y)))
}
export function scaleMat(k: number, c: Vec): Mat {
  return matMul(translateMat(c.x, c.y), matMul([k, 0, 0, k, 0, 0], translateMat(-c.x, -c.y)))
}
export function mirrorMat(axis: 'h' | 'v', c: Vec): Mat {
  // 'h' : miroir horizontal (gauche ↔ droite), 'v' : vertical (haut ↔ bas)
  const s: Mat = axis === 'h' ? [-1, 0, 0, 1, 0, 0] : [1, 0, 0, -1, 0, 0]
  return matMul(translateMat(c.x, c.y), matMul(s, translateMat(-c.x, -c.y)))
}
export const matDet = (m: Mat) => m[0] * m[3] - m[1] * m[2]
