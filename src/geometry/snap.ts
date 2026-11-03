import type { DocState, Vec } from '../model/types'
import { dist, closestOnSegment, sub, len } from './vec'
import { distToShape, segCount, segEnds, segPoint } from './shapes'
import { nearestOnShape, shapeIntersections } from './paperScope'

export type SnapKind = 'extrémité' | 'intersection' | 'milieu' | 'sur le trait' | 'coin' | 'bord du mur' | 'grille' | 'angle' | 'libre'

export interface SnapResult {
  p: Vec
  kind: SnapKind
}

export interface SnapOptions {
  /** Distance d'attraction en cm (déjà convertie depuis les pixels). */
  radius: number
  /** Formes à ignorer (ex. la forme en cours d'édition). */
  exclude?: Set<string>
  /** Points supplémentaires (ex. points déjà posés du tracé en cours). */
  extra?: Vec[]
  disabled?: boolean
}

export function snapPoint(doc: DocState, p: Vec, opt: SnapOptions): SnapResult {
  if (opt.disabled) return { p, kind: 'libre' }
  const r = opt.radius
  const shapes = opt.exclude?.size ? doc.shapes.filter((s) => !opt.exclude!.has(s.id)) : doc.shapes
  const tiers: { kind: SnapKind; pts: Vec[] }[] = []

  const ends: Vec[] = [...(opt.extra ?? [])]
  const mids: Vec[] = []
  for (const s of shapes) {
    for (const q of s.pts) ends.push(q)
    for (let i = 0; i < segCount(s); i++) mids.push(segPoint(s, i, 0.5))
  }
  const W = doc.wall
  tiers.push({ kind: 'extrémité', pts: ends })
  tiers.push({ kind: 'coin', pts: [{ x: 0, y: 0 }, { x: W.w, y: 0 }, { x: 0, y: W.h }, { x: W.w, y: W.h }] })
  tiers.push({ kind: 'intersection', pts: shapeIntersections(shapes) })
  tiers.push({ kind: 'milieu', pts: mids })

  for (const t of tiers) {
    let best: Vec | null = null
    let bd = r
    for (const q of t.pts) {
      const d = dist(p, q)
      if (d <= bd) {
        bd = d
        best = q
      }
    }
    if (best) return { p: { ...best }, kind: t.kind }
  }

  // sur un trait existant (crée une jonction en T)
  let onBest: Vec | null = null
  let onD = r
  for (const s of shapes) {
    if (distToShape(p, s) > r * 1.5) continue
    const q = nearestOnShape(s, p)
    const d = dist(p, q)
    if (d <= onD) {
      onD = d
      onBest = q
    }
  }
  if (onBest) return { p: onBest, kind: 'sur le trait' }

  // bords du mur
  const corners = [{ x: 0, y: 0 }, { x: W.w, y: 0 }, { x: W.w, y: W.h }, { x: 0, y: W.h }]
  let edgeBest: Vec | null = null
  let ed = r
  for (let i = 0; i < 4; i++) {
    const q = closestOnSegment(p, corners[i], corners[(i + 1) % 4])
    const d = dist(p, q)
    if (d <= ed) {
      ed = d
      edgeBest = q
    }
  }
  if (edgeBest) {
    // sur un bord, on garde l'aimantage grille le long du bord
    const g = doc.grid.snapStep
    const e = { x: Math.round(edgeBest.x / g) * g, y: Math.round(edgeBest.y / g) * g }
    if (Math.abs(edgeBest.x) < 1e-6 || Math.abs(edgeBest.x - W.w) < 1e-6) e.x = edgeBest.x
    else e.y = edgeBest.y
    return { p: e, kind: 'bord du mur' }
  }

  const g = doc.grid.snapStep
  if (g > 0) return { p: { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g }, kind: 'grille' }
  return { p, kind: 'libre' }
}

/** Contraint p sur une direction multiple de 45° depuis `from` ; longueur arrondie au pas d'aimantage. */
export function constrainAngle(from: Vec, p: Vec, step: number): Vec {
  const d = sub(p, from)
  const a = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * (Math.PI / 4)
  let l = len(d) * Math.cos(Math.atan2(d.y, d.x) - a)
  if (step > 0) l = Math.round(l / step) * step
  return { x: from.x + Math.cos(a) * l, y: from.y + Math.sin(a) * l }
}

/**
 * Interprète une saisie numérique : « 120 » (longueur dans la direction du curseur)
 * ou « 120<30 » (longueur et angle en degrés, sens trigonométrique, 0° = vers la droite).
 */
export function parseLengthInput(txt: string, from: Vec, cursor: Vec): Vec | null {
  const m = txt.trim().replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*(?:<\s*(-?\d+(?:\.\d+)?))?$/)
  if (!m) return null
  const l = parseFloat(m[1])
  let a: number
  if (m[2] !== undefined) a = (-parseFloat(m[2]) * Math.PI) / 180
  else {
    const d = sub(cursor, from)
    a = len(d) < 1e-9 ? 0 : Math.atan2(d.y, d.x)
  }
  return { x: from.x + Math.cos(a) * l, y: from.y + Math.sin(a) * l }
}

export function segmentsOf(doc: DocState) {
  const out: [Vec, Vec][] = []
  for (const s of doc.shapes) for (let i = 0; i < segCount(s); i++) out.push(segEnds(s, i))
  return out
}
