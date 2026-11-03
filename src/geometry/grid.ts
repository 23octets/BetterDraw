import type { GridLineStyle, GridSettings, Vec } from '../model/types'

export function colLabel(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function colIndex(label: string): number {
  let n = 0
  for (const ch of label) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export interface GridCell {
  id: string
  col: number
  row: number
  /** Rectangle en coordonnées du mur (origine haut-gauche, y vers le bas). */
  x: number
  y: number
  w: number
  h: number
}

export interface GridLine {
  /** Position en coordonnées mur. */
  pos: number
  /** Distance depuis l'origine de la grille (cote). */
  cote: number
}

export interface GridLayout {
  cols: number
  rows: number
  vLines: GridLine[]
  hLines: GridLine[]
  cells: GridCell[]
}

/**
 * Calcule la grille de carroyage. Les colonnes (A, B, …) partent du côté de l'origine,
 * les lignes (1, 2, …) aussi. La dernière case peut être partielle.
 */
export function gridLayout(wall: { w: number; h: number }, g: GridSettings): GridLayout {
  const stepX = Math.max(1, g.step)
  const stepY = Math.max(1, g.stepY ?? g.step)
  const fromRight = g.origin === 'br' || g.origin === 'tr'
  const fromBottom = g.origin === 'bl' || g.origin === 'br'
  const coords = (size: number, step: number) => {
    const out: number[] = []
    for (let c = 0; c < size - 1e-6; c += step) out.push(c)
    out.push(size)
    return out
  }
  const xs = coords(wall.w, stepX)
  const ys = coords(wall.h, stepY)
  const vLines = xs.map((c) => ({ pos: fromRight ? wall.w - c : c, cote: c }))
  const hLines = ys.map((c) => ({ pos: fromBottom ? wall.h - c : c, cote: c }))
  const cells: GridCell[] = []
  for (let r = 0; r < ys.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      const xa = vLines[c].pos, xb = vLines[c + 1].pos
      const ya = hLines[r].pos, yb = hLines[r + 1].pos
      cells.push({
        id: `${colLabel(c)}${r + 1}`,
        col: c,
        row: r,
        x: Math.min(xa, xb),
        y: Math.min(ya, yb),
        w: Math.abs(xb - xa),
        h: Math.abs(yb - ya),
      })
    }
  }
  return { cols: xs.length - 1, rows: ys.length - 1, vLines, hLines, cells }
}

export function cellAt(layout: GridLayout, p: Vec): GridCell | undefined {
  return layout.cells.find((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h)
}

/** Cote d'un point mesurée depuis l'origine de la grille. */
export function toGridCoords(wall: { w: number; h: number }, g: GridSettings, p: Vec): Vec {
  const fromRight = g.origin === 'br' || g.origin === 'tr'
  const fromBottom = g.origin === 'bl' || g.origin === 'br'
  return { x: fromRight ? wall.w - p.x : p.x, y: fromBottom ? wall.h - p.y : p.y }
}

export function formatCm(n: number): string {
  const r = Math.round(n * 10) / 10
  return `${Number.isInteger(r) ? r : r.toFixed(1)} cm`
}

const ACCENT = [200, 100, 59]

function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255]
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Couleur de grille lisible sur un aplat donné : l'accent orangé sur les fonds clairs
 * éloignés de l'accent, sinon noir ou blanc selon la luminance.
 */
export function gridStrokeFor(hex: string): string {
  const [r, g, b] = rgb(hex)
  const d = Math.hypot(r - ACCENT[0], g - ACCENT[1], b - ACCENT[2])
  const L = luminance(hex)
  if (L > 0.45 && d > 140) return 'rgba(200,100,59,0.75)'
  return L > 0.3 ? 'rgba(20,20,22,0.6)' : 'rgba(255,255,255,0.8)'
}


export const LINE_STYLES: { id: GridLineStyle; label: string }[] = [
  { id: 'solid', label: 'Continu' },
  { id: 'dashed', label: 'Tirets' },
  { id: 'longdash', label: 'Tirets longs' },
  { id: 'dotted', label: 'Pointillés' },
  { id: 'dashdot', label: 'Mixte' },
]

/** Motif de tirets (en unités de l'épaisseur du trait), ou null pour un trait continu. */
export function dashPattern(style: GridLineStyle | undefined): number[] | null {
  switch (style ?? 'dashed') {
    case 'solid': return null
    case 'dotted': return [0.01, 3]
    case 'longdash': return [10, 5]
    case 'dashdot': return [8, 3, 0.01, 3]
    default: return [4, 3]
  }
}

/** stroke-dasharray pour une épaisseur donnée (le motif grossit avec le trait, minimum 1). */
export function dashArray(style: GridLineStyle | undefined, width: number): string | undefined {
  const p = dashPattern(style)
  if (!p) return undefined
  const k = Math.max(1, width)
  return p.map((x) => +(x * k).toFixed(3)).join(' ')
}

/** Le pas donne-t-il un nombre entier de cases sur cette longueur ? */
export function divides(size: number, step: number): boolean {
  if (step <= 0) return false
  const n = size / step
  return Math.abs(n - Math.round(n)) < 1e-6
}

/**
 * Pas le plus proche en dessous et au-dessus de `step` donnant un nombre entier de cases :
 * on privilégie des valeurs entières en cm (plus simples à tracer au mur), sinon longueur / n.
 */
export function stepSuggestions(size: number, step: number): { below: { step: number; count: number } | null; above: { step: number; count: number } | null } {
  if (divides(size, step) || step <= 0) return { below: null, above: null }
  const cands: { step: number; count: number }[] = []
  const isInt = Math.abs(size - Math.round(size)) < 1e-9
  if (isInt) {
    const S = Math.round(size)
    for (let d = 1; d <= S; d++) if (S % d === 0) cands.push({ step: d, count: S / d })
  }
  const fallback = (n: number) => (n >= 1 ? { step: +(size / n).toFixed(2), count: n } : null)
  const below = cands.filter((c) => c.step < step).at(-1) ?? fallback(Math.ceil(size / step))
  const above = cands.find((c) => c.step > step) ?? fallback(Math.floor(size / step))
  return { below: below && below.step < step ? below : null, above: above && above.step > step ? above : null }
}

/** Pas commun aux deux dimensions (colonnes et lignes entières), au plus proche du pas actuel. */
export function commonStepSuggestions(w: number, h: number, step: number) {
  if ((divides(w, step) && divides(h, step)) || step <= 0) return { below: null, above: null }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  if (Math.abs(w - Math.round(w)) > 1e-9 || Math.abs(h - Math.round(h)) > 1e-9) return { below: null, above: null }
  const g = gcd(Math.round(w), Math.round(h))
  const ds: number[] = []
  for (let d = 1; d <= g; d++) if (g % d === 0) ds.push(d)
  const below = ds.filter((d) => d < step).at(-1)
  const above = ds.find((d) => d > step)
  return { below: below ?? null, above: above ?? null }
}

/** Pas vertical effectif. */
export const stepYOf = (g: Pick<GridSettings, 'step' | 'stepY'>) => g.stepY ?? g.step
