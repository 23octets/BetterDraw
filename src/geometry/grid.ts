import type { GridSettings, Vec } from '../model/types'

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
  const step = Math.max(1, g.step)
  const fromRight = g.origin === 'br' || g.origin === 'tr'
  const fromBottom = g.origin === 'bl' || g.origin === 'br'
  const coords = (size: number) => {
    const out: number[] = []
    for (let c = 0; c < size - 1e-6; c += step) out.push(c)
    out.push(size)
    return out
  }
  const xs = coords(wall.w)
  const ys = coords(wall.h)
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
