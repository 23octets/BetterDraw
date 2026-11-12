import type { Shape, Vec } from '../model/types'
import { flatten, segCount, segPoint } from './shapes'
import { getPaper, toPaperPath } from './paperScope'
import { nearestU, subShape } from './trim'

type Wall = { w: number; h: number }

const TOL = 1e-3 // cm

const inside = (p: Vec, wall: Wall, e = TOL) => p.x >= -e && p.y >= -e && p.x <= wall.w + e && p.y <= wall.h + e

function pointAtU(s: Shape, u: number): Vec {
  const n = segCount(s)
  const w = ((u % n) + n) % n
  const i = Math.min(n - 1, Math.floor(w))
  return segPoint(s, i, w - i)
}

/** Ramène un point de coupe exactement sur le bord du mur (le calcul d'intersection est approché). */
function onBorder(p: Vec, wall: Wall): Vec {
  const snap = (v: number, max: number) => (Math.abs(v) < 0.01 ? 0 : Math.abs(v - max) < 0.01 ? max : Math.min(max, Math.max(0, v)))
  return { x: snap(p.x, wall.w), y: snap(p.y, wall.h) }
}

/**
 * Coupe un trait à ses intersections avec le bord du mur et ne garde que les morceaux dans le mur.
 * Les extrémités coupées tombent sur le bord : le bord du mur ferme alors les zones formées par le trait.
 * Le premier morceau garde l'identifiant de la forme (sélection, liens).
 */
export function clipShapeToWall(s: Shape, wall: Wall): Shape[] {
  if (s.pts.length < 2 || flatten(s).every((p) => inside(p, wall))) return [s]
  const P = getPaper()
  const n = segCount(s)
  const border = new P.Path.Rectangle({ point: [0, 0], size: [wall.w, wall.h], insert: false })
  const found: { u: number; p: Vec }[] = []
  for (const loc of toPaperPath(s).getIntersections(border)) {
    const p = { x: loc.point.x, y: loc.point.y }
    const r = nearestU(s, p)
    if (r.d > 0.1) continue
    if (!s.closed && (r.u < 1e-6 || r.u > n - 1e-6)) continue
    if (!found.some((c) => Math.abs(c.u - r.u) < 1e-6)) found.push({ u: r.u, p: onBorder(p, wall) })
  }
  found.sort((a, b) => a.u - b.u)
  const cuts = found.map((c) => c.u)
  const cutPoint = (u: number) => found.find((c) => Math.abs(c.u - (((u % n) + n) % n)) < 1e-9)?.p

  // intervalles [u0, u1] entre deux coupes, marqués dedans / dehors d'après leur milieu
  let spans: { u0: number; u1: number; keep: boolean }[] = []
  const bounds = s.closed ? (cuts.length ? [...cuts, cuts[0] + n] : []) : [0, ...cuts, n]
  // forme fermée sans croisement (et pas entièrement dans le mur) : entièrement dehors
  if (s.closed && !cuts.length) return []
  for (let k = 0; k < bounds.length - 1; k++) {
    const u0 = bounds[k], u1 = bounds[k + 1]
    if (u1 - u0 < 1e-9) continue
    spans.push({ u0, u1, keep: inside(pointAtU(s, (u0 + u1) / 2), wall) })
  }
  // un trait qui ne fait que toucher le bord n'est pas coupé : on recolle les morceaux voisins
  const merged: typeof spans = []
  for (const sp of spans) {
    const last = merged[merged.length - 1]
    if (last && last.keep === sp.keep) last.u1 = sp.u1
    else merged.push({ ...sp })
  }
  if (s.closed && merged.length > 1 && merged[0].keep === merged[merged.length - 1].keep) {
    const last = merged.pop()!
    merged[0] = { u0: last.u0 - n, u1: merged[0].u1, keep: last.keep }
  }
  spans = merged
  if (spans.every((sp) => sp.keep)) return [s]

  const out: Shape[] = []
  for (const sp of spans) {
    if (!sp.keep) continue
    const piece = subShape(s, sp.u0, sp.u1)
    if (piece.pts.length < 2) continue
    piece.pts[0] = cutPoint(sp.u0) ?? piece.pts[0]
    piece.pts[piece.pts.length - 1] = cutPoint(sp.u1) ?? piece.pts[piece.pts.length - 1]
    const a = piece.pts[0], b = piece.pts[piece.pts.length - 1]
    if (piece.pts.length === 2 && Math.hypot(a.x - b.x, a.y - b.y) < 0.01) continue
    out.push(out.length ? piece : { ...piece, id: s.id })
  }
  return out
}

/** Applique le découpage au bord du mur à toutes les formes ; renvoie null si rien ne change. */
export function clipShapesToWall(shapes: Shape[], wall: Wall, only?: (s: Shape) => boolean): Shape[] | null {
  let changed = false
  const out: Shape[] = []
  for (const s of shapes) {
    if (only && !only(s)) { out.push(s); continue }
    const pieces = clipShapeToWall(s, wall)
    if (pieces.length !== 1 || pieces[0] !== s) changed = true
    out.push(...pieces)
  }
  return changed ? out : null
}
