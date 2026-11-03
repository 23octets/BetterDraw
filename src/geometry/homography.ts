import type { Vec } from '../model/types'

/** Matrice 3×3 en ligne : [a b c; d e f; g h i]. */
export type H3 = [number, number, number, number, number, number, number, number, number]

/** Résout A x = b (Gauss avec pivot partiel). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('points alignés : perspective impossible')
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / M[i][i])
}

/** Homographie qui envoie src[i] sur dst[i] (4 points). */
export function homography(src: Vec[], dst: Vec[]): H3 {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = solve(A, b)
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
}

export function applyH(H: H3, p: Vec): Vec {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

/** Composante w (signe : devant / derrière l'horizon). */
export function hW(H: H3, p: Vec): number {
  return H[6] * p.x + H[7] * p.y + H[8]
}

export function invertH(m: H3): H3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-14) throw new Error('homographie non inversible')
  const inv: H3 = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d]
  return inv.map((x) => x / det) as H3
}

const len = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)

/** Le quadrilatère (ordre haut-gauche, haut-droit, bas-droit, bas-gauche) est-il convexe et non dégénéré ? */
export function isConvexQuad(q: Vec[]): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cr) < 1e-9) return false
    if (sign === 0) sign = Math.sign(cr)
    else if (Math.sign(cr) !== sign) return false
  }
  return true
}

export interface WarpPlan {
  /** Homographie source (px) → image corrigée complète (px). */
  H: H3
  /** Taille de l'image corrigée complète. */
  full: { w: number; h: number }
  /** Rectangle correspondant au quadrilatère, dans l'image corrigée. */
  rect: { x: number; y: number; w: number; h: number }
}

/**
 * Prépare la correction : le quadrilatère `quad` (coins du mur sur la photo) devient un rectangle.
 * Proportions : dimensions réelles si fournies, sinon moyenne des côtés opposés.
 * Toute l'image est conservée, en limitant le débordement (perspective forte) à `maxOverflow`
 * fois la taille du rectangle de chaque côté, et la taille finale à `maxSide` pixels.
 */
export function planWarp(
  src: { w: number; h: number },
  quad: Vec[],
  opts: { ratio?: number; maxSide?: number; maxOverflow?: number } = {},
): WarpPlan {
  const maxSide = opts.maxSide ?? 3000
  const maxOverflow = opts.maxOverflow ?? 1
  let rw = (len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2
  let rh = (len(quad[0], quad[3]) + len(quad[1], quad[2])) / 2
  if (opts.ratio && opts.ratio > 0) {
    // même surface, proportions exactes
    const area = rw * rh
    rw = Math.sqrt(area * opts.ratio)
    rh = rw / opts.ratio
  }
  const unit: Vec[] = [{ x: 0, y: 0 }, { x: rw, y: 0 }, { x: rw, y: rh }, { x: 0, y: rh }]
  const H0 = homography(quad, unit)
  // emprise de l'image entière une fois corrigée
  const corners = [{ x: 0, y: 0 }, { x: src.w, y: 0 }, { x: src.w, y: src.h }, { x: 0, y: src.h }]
  const lim = { x0: -rw * maxOverflow, y0: -rh * maxOverflow, x1: rw * (1 + maxOverflow), y1: rh * (1 + maxOverflow) }
  let x0 = 0, y0 = 0, x1 = rw, y1 = rh
  // on échantillonne le bord de l'image (les bords restent droits, mais un coin peut passer derrière l'horizon)
  for (let k = 0; k < 4; k++) {
    const a = corners[k], b = corners[(k + 1) % 4]
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (hW(H0, p) <= 1e-9) continue
      const q = applyH(H0, p)
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y)
      x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y)
    }
  }
  x0 = Math.max(x0, lim.x0); y0 = Math.max(y0, lim.y0)
  x1 = Math.min(x1, lim.x1); y1 = Math.min(y1, lim.y1)
  const k = Math.min(1, maxSide / Math.max(x1 - x0, y1 - y0))
  // translation + mise à l'échelle finale
  const T: H3 = [k, 0, -x0 * k, 0, k, -y0 * k, 0, 0, 1]
  const H = mulH(T, H0)
  return {
    H,
    full: { w: Math.max(1, Math.round((x1 - x0) * k)), h: Math.max(1, Math.round((y1 - y0) * k)) },
    rect: { x: -x0 * k, y: -y0 * k, w: rw * k, h: rh * k },
  }
}

export function mulH(a: H3, b: H3): H3 {
  const r = new Array(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
  return r as H3
}

/**
 * Déforme les pixels : pour chaque pixel de sortie, on va chercher (bilinéaire) le pixel source.
 * `Hinv` : sortie → source. Hors de la source : transparent.
 */
export function warpPixels(
  src: { data: Uint8ClampedArray; width: number; height: number },
  Hinv: H3,
  out: { width: number; height: number },
): Uint8ClampedArray {
  const { data, width: sw, height: sh } = src
  const res = new Uint8ClampedArray(out.width * out.height * 4)
  const [a, b, c, d, e, f, g, h, i] = Hinv
  for (let y = 0; y < out.height; y++) {
    const py = y + 0.5
    for (let x = 0; x < out.width; x++) {
      const px = x + 0.5
      const w = g * px + h * py + i
      if (w <= 0) continue
      const sx = (a * px + b * py + c) / w - 0.5
      const sy = (d * px + e * py + f) / w - 0.5
      if (sx < -0.5 || sy < -0.5 || sx > sw - 0.5 || sy > sh - 0.5) continue
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)))
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)))
      const x1 = Math.min(sw - 1, x0 + 1)
      const y1 = Math.min(sh - 1, y0 + 1)
      const fx = Math.max(0, Math.min(1, sx - x0))
      const fy = Math.max(0, Math.min(1, sy - y0))
      const o = (y * out.width + x) * 4
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4
      for (let ch = 0; ch < 4; ch++) {
        const top = data[i00 + ch] * (1 - fx) + data[i10 + ch] * fx
        const bot = data[i01 + ch] * (1 - fx) + data[i11 + ch] * fx
        res[o + ch] = top * (1 - fy) + bot * fy
      }
    }
  }
  return res
}
