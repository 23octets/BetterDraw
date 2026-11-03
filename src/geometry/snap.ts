import type { DocState, Vec } from '../model/types'
import { dist, closestOnSegment, sub, len } from './vec'
import { distToShape, segCount, segEnds, segPoint } from './shapes'
import { getPaper, nearestOnShape, shapeIntersections, toPaperPath } from './paperScope'
import { gridLayout } from './grid'

export type SnapKind = 'extrémité' | 'intersection' | 'milieu' | 'sur le trait' | 'coin' | 'bord du mur' | 'grille' | 'angle' | 'libre' | 'nœud de grille' | 'trait × grille' | 'ligne de grille'

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
  /** Aimanter aussi sur la grille de carroyage (nœuds, lignes, croisements avec les traits). */
  carroyage?: boolean
}

const gridCache = new WeakMap<object, Map<string, { nodes: Vec[]; cross: Vec[] }>>()

/** Nœuds de la grille de carroyage et croisements des traits avec ses lignes (mémoïsés). */
export function carroyagePoints(doc: DocState): { nodes: Vec[]; cross: Vec[] } {
  const key = JSON.stringify([doc.wall, doc.grid.step, doc.grid.stepY, doc.grid.origin])
  let m = gridCache.get(doc.shapes)
  if (!m) gridCache.set(doc.shapes, (m = new Map()))
  const hit = m.get(key)
  if (hit) return hit
  const L = gridLayout(doc.wall, doc.grid)
  const nodes: Vec[] = []
  for (const v of L.vLines) for (const h of L.hLines) nodes.push({ x: v.pos, y: h.pos })
  const cross: Vec[] = []
  if (doc.shapes.length) {
    const P = getPaper()
    const lines = [
      ...L.vLines.map((v) => new P.Path.Line({ from: [v.pos, 0], to: [v.pos, doc.wall.h], insert: false })),
      ...L.hLines.map((h) => new P.Path.Line({ from: [0, h.pos], to: [doc.wall.w, h.pos], insert: false })),
    ]
    for (const s of doc.shapes) {
      const sp = toPaperPath(s)
      for (const l of lines) for (const loc of sp.getIntersections(l)) cross.push({ x: loc.point.x, y: loc.point.y })
    }
  }
  const out = { nodes, cross }
  m.set(key, out)
  return out
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
  if (opt.carroyage && doc.grid.show) {
    const g = carroyagePoints(doc)
    tiers.push({ kind: 'trait × grille', pts: g.cross })
    tiers.push({ kind: 'nœud de grille', pts: g.nodes })
  }
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

  // sur une ligne de la grille de carroyage (l'autre coordonnée reste sur l'aimantage fin)
  if (opt.carroyage && doc.grid.show) {
    const L = gridLayout(doc.wall, doc.grid)
    const g = doc.grid.snapStep
    const fine = (x: number) => (g > 0 ? Math.round(x / g) * g : x)
    let best: Vec | null = null
    let bd = r
    for (const v of L.vLines.filter((v) => v.pos > 1e-6 && v.pos < doc.wall.w - 1e-6)) {
      const d = Math.abs(p.x - v.pos)
      if (d <= bd && p.y >= -r && p.y <= doc.wall.h + r) {
        bd = d
        best = { x: v.pos, y: Math.max(0, Math.min(doc.wall.h, fine(p.y))) }
      }
    }
    for (const h of L.hLines.filter((h) => h.pos > 1e-6 && h.pos < doc.wall.h - 1e-6)) {
      const d = Math.abs(p.y - h.pos)
      if (d <= bd && p.x >= -r && p.x <= doc.wall.w + r) {
        bd = d
        best = { x: Math.max(0, Math.min(doc.wall.w, fine(p.x))), y: h.pos }
      }
    }
    if (best) return { p: best, kind: 'ligne de grille' }
  }


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

/**
 * Aimantage le long d'une direction contrainte (Shift) : on cherche, près du point contraint,
 * les intersections du rayon avec les bords du mur et les traits, ou une extrémité alignée.
 */
export function snapOnRay(doc: DocState, from: Vec, constrained: Vec, radius: number, exclude?: Set<string>, carroyage = false): SnapResult | null {
  const dir = sub(constrained, from)
  const L = len(dir)
  if (L < 1e-9) return null
  const u = { x: dir.x / L, y: dir.y / L }
  const far = Math.max(doc.wall.w, doc.wall.h) * 4 + L
  const P = getPaper()
  const ray = new P.Path.Line({ from: [from.x, from.y], to: [from.x + u.x * far, from.y + u.y * far], insert: false })
  const cands: { p: Vec; kind: SnapKind }[] = []
  const W = doc.wall
  const wallPath = new P.Path.Rectangle({ point: [0, 0], size: [W.w, W.h], insert: false })
  for (const loc of ray.getIntersections(wallPath)) cands.push({ p: { x: loc.point.x, y: loc.point.y }, kind: 'bord du mur' })
  if (carroyage && doc.grid.show) {
    const L = gridLayout(doc.wall, doc.grid)
    // les lignes confondues avec les bords du mur restent des « bords du mur »
    // lignes parallèles au rayon ignorées (pas de vrai croisement)
    const vertical = Math.abs(u.x) < 1e-9
    const horizontal = Math.abs(u.y) < 1e-9
    for (const v of L.vLines.filter((v) => !vertical && v.pos > 1e-6 && v.pos < doc.wall.w - 1e-6)) {
      const l = new P.Path.Line({ from: [v.pos, 0], to: [v.pos, doc.wall.h], insert: false })
      for (const loc of ray.getIntersections(l)) cands.push({ p: { x: loc.point.x, y: loc.point.y }, kind: 'ligne de grille' })
    }
    for (const h of L.hLines.filter((h) => !horizontal && h.pos > 1e-6 && h.pos < doc.wall.h - 1e-6)) {
      const l = new P.Path.Line({ from: [0, h.pos], to: [doc.wall.w, h.pos], insert: false })
      for (const loc of ray.getIntersections(l)) cands.push({ p: { x: loc.point.x, y: loc.point.y }, kind: 'ligne de grille' })
    }
  }
  const shapes = exclude?.size ? doc.shapes.filter((s) => !exclude.has(s.id)) : doc.shapes
  for (const s of shapes) {
    const sp = toPaperPath(s)
    for (const loc of ray.getIntersections(sp)) cands.push({ p: { x: loc.point.x, y: loc.point.y }, kind: 'sur le trait' })
    // extrémités alignées sur le rayon
    for (const q of s.pts) {
      const t = (q.x - from.x) * u.x + (q.y - from.y) * u.y
      const perpD = Math.abs((q.x - from.x) * u.y - (q.y - from.y) * u.x)
      // projection de l'extrémité sur la direction : on reste orthogonal mais aligné sur elle
      if (t > 0 && perpD < radius) cands.push({ p: { x: from.x + u.x * t, y: from.y + u.y * t }, kind: 'extrémité' })
    }
  }
  let best: { p: Vec; kind: SnapKind } | null = null
  let bd = radius
  for (const c of cands) {
    const d = dist(c.p, constrained)
    if (d <= bd + 1e-9 && dist(c.p, from) > 1e-6) {
      bd = d
      best = c
    }
  }
  return best ? { p: { ...best.p }, kind: best.kind } : null
}
