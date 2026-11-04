import { nanoid } from 'nanoid'
import type { Opening, OpeningKind, Rect, RoomGroup, RoomPlan, RoomWall, Vec } from '../model/types'

export const DEFAULT_ROOM = { w: 400, d: 320, h: 250, thickness: 15, floor: '#c8a57a' }

export const OPENING_DEFAULTS: Record<OpeningKind, { w: number; h: number; sill: number }> = {
  door: { w: 83, h: 204, sill: 0 },
  window: { w: 120, h: 125, sill: 95 },
}
export const OPENING_LABEL: Record<OpeningKind, string> = { door: 'Porte', window: 'Fenêtre' }

/** Aire signée (repère écran, y vers le bas) : positive si le polygone tourne dans le sens horaire à l'écran. */
export function signedArea(pts: Vec[]) {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export const roomArea = (room: RoomPlan) => Math.abs(signedArea(room.pts))
export const perimeter = (room: RoomPlan) => room.pts.reduce((s, _, i) => s + wallLength(room, i), 0)

export interface WallSeg {
  index: number
  a: Vec
  b: Vec
  len: number
  /** Direction unitaire a → b. */
  dir: Vec
  /** Normale unitaire vers l'intérieur de la pièce. */
  n: Vec
}

export function wallSeg(room: RoomPlan, i: number): WallSeg {
  const k = room.pts.length
  const a = room.pts[((i % k) + k) % k]
  const b = room.pts[(i + 1) % k]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const dir = len > 1e-9 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 }
  // sens horaire à l'écran : l'intérieur est à droite de la direction (repère y vers le bas)
  return { index: i, a, b, len, dir, n: { x: -dir.y, y: dir.x } }
}

export const wallLength = (room: RoomPlan, i: number) => wallSeg(room, i).len

/**
 * Coins extérieurs (angles à onglet) : les murs sont épaissis vers l'extérieur.
 * outer[i] correspond à pts[i].
 */
export function outerPts(room: RoomPlan): Vec[] {
  const t = room.thickness
  const k = room.pts.length
  return room.pts.map((p, i) => {
    const n1 = wallSeg(room, i - 1).n
    const n2 = wallSeg(room, i).n
    // normales extérieures
    const o1 = { x: -n1.x, y: -n1.y }
    const o2 = { x: -n2.x, y: -n2.y }
    const dot = o1.x * o2.x + o1.y * o2.y
    const denom = 1 + dot
    if (denom < 0.05 || k < 3) return { x: p.x + o2.x * t, y: p.y + o2.y * t }
    let mx = ((o1.x + o2.x) * t) / denom
    let my = ((o1.y + o2.y) * t) / denom
    // angle très aigu : on borne l'onglet
    const m = Math.hypot(mx, my)
    if (m > t * 4) {
      mx = (mx / m) * t * 4
      my = (my / m) * t * 4
    }
    return { x: p.x + mx, y: p.y + my }
  })
}

/** Remet le polygone dans le sens horaire (à l'écran) en conservant l'association mur ↔ côté. */
export function normalizeOrientation(room: RoomPlan): RoomPlan {
  if (signedArea(room.pts) >= 0) return room
  const k = room.pts.length
  // inverser : le côté i (pts[i] → pts[i+1]) devient le côté k-2-i du nouveau tableau
  const pts = [...room.pts].reverse()
  const walls: RoomWall[] = pts.map((_, j) => {
    const old = room.walls[(k - 2 - j + k) % k]
    const len = Math.hypot(pts[(j + 1) % k].x - pts[j].x, pts[(j + 1) % k].y - pts[j].y)
    // vu de l'intérieur, la gauche et la droite s'échangent
    return { ...old, openings: old.openings.map((o) => ({ ...o, x: len - o.x - o.w })) }
  })
  return { ...room, pts, walls }
}

export function rectRoom(w: number, d: number, wallIds: string[], h = DEFAULT_ROOM.h): RoomPlan {
  return {
    pts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }],
    walls: wallIds.map((id) => ({ id, openings: [] })),
    height: h,
    thickness: DEFAULT_ROOM.thickness,
    floor: DEFAULT_ROOM.floor,
  }
}

/** Rectangle de l'ouverture dans les coordonnées du dessin du mur (origine en haut à gauche, cm). */
export function openingRect(o: Opening, wallH: number): Rect {
  return { x: o.x, y: wallH - o.sill - o.h, w: o.w, h: o.h }
}

/** Ramène une ouverture dans les limites du mur. */
export function clampOpening(o: Opening, len: number, height: number): Opening {
  const w = Math.max(10, Math.min(o.w, len))
  const sill = o.kind === 'door' ? 0 : Math.max(0, Math.min(o.sill, height - 10))
  const h = Math.max(10, Math.min(o.h, height - sill))
  const x = Math.max(0, Math.min(o.x, len - w))
  const out = { ...o, x: round1(x), w: round1(w), h: round1(h), sill: round1(sill) }
  if (o.kind === 'window') {
    if (o.cols !== undefined) out.cols = Math.max(1, Math.min(12, Math.round(o.cols)))
    if (o.rows !== undefined) out.rows = Math.max(1, Math.min(12, Math.round(o.rows)))
    // le soubassement laisse au moins 20 cm de fenêtre au-dessus
    if (o.base !== undefined) out.base = round1(Math.max(0, Math.min(o.base, h - 20)))
  }
  return out
}

/** Carreaux d'une fenêtre (colonnes × lignes de la partie haute). */
export const windowCols = (o: Opening) => o.cols ?? (o.w > 90 ? 2 : 1)
export const windowRows = (o: Opening) => o.rows ?? 1
export const windowBase = (o: Opening) => (o.kind === 'window' ? o.base ?? 0 : 0)

/**
 * Active / retire le soubassement vitré : l'allège devient vitrée (la fenêtre descend jusqu'au sol)
 * ou redevient pleine.
 */
export function toggleGlazedBase(o: Opening, on: boolean): Opening {
  if (on && !windowBase(o)) {
    const base = o.sill > 20 ? o.sill : 90
    return { ...o, base, h: o.h + o.sill, sill: 0 }
  }
  if (!on && windowBase(o)) {
    const b = windowBase(o)
    return { ...o, base: 0, sill: o.sill + b, h: Math.max(20, o.h - b) }
  }
  return o
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** Nouvelle ouverture placée dans le plus grand espace libre du mur. */
export function newOpening(kind: OpeningKind, len: number, height: number, existing: Opening[]): Opening {
  const def = OPENING_DEFAULTS[kind]
  const sorted = [...existing].sort((a, b) => a.x - b.x)
  let best = { from: 0, to: len }
  let cursor = 0
  let bestLen = -1
  for (const o of [...sorted, { x: len, w: 0 } as Opening]) {
    const gap = o.x - cursor
    if (gap > bestLen) {
      bestLen = gap
      best = { from: cursor, to: o.x }
    }
    cursor = Math.max(cursor, o.x + o.w)
  }
  const w = Math.min(def.w, Math.max(10, best.to - best.from - 10))
  const x = best.from + (best.to - best.from - w) / 2
  return clampOpening({ id: nanoid(8), kind, x, w, h: def.h, sill: def.sill }, len, height)
}

/** Ouvertures qui se chevauchent ou sortent du mur (pour avertir). */
export function openingIssues(room: RoomPlan, i: number): string[] {
  const len = wallLength(room, i)
  const ops = [...room.walls[i].openings].sort((a, b) => a.x - b.x)
  const out: string[] = []
  for (const o of ops) if (o.x < -0.01 || o.x + o.w > len + 0.01) out.push(`${OPENING_LABEL[o.kind]} hors du mur`)
  for (let k = 1; k < ops.length; k++) if (ops[k].x < ops[k - 1].x + ops[k - 1].w - 0.01) out.push('Deux ouvertures se chevauchent')
  return out
}

/** Côté qui s'allonge quand on change la longueur d'un mur (vu de l'intérieur). */
export type GrowSide = 'right' | 'left' | 'both'

/**
 * Déplace les coins `move` de v. Les murs translatés en bloc gardent leurs ouvertures ;
 * pour un mur dont seul le coin de départ bouge, les ouvertures restent à leur place dans la pièce.
 */
function translateCorners(room: RoomPlan, move: Set<number>, v: Vec): RoomPlan {
  const k = room.pts.length
  const pts = room.pts.map((p, j) => (move.has(j) ? { x: round1(p.x + v.x), y: round1(p.y + v.y) } : p))
  const walls = room.walls.map((w, i) => {
    if (!move.has(i) || move.has((i + 1) % k)) return w
    const d = wallSeg(room, i).dir
    const shift = v.x * d.x + v.y * d.y
    return { ...w, openings: w.openings.map((o) => ({ ...o, x: o.x - shift })) }
  })
  return { ...room, pts, walls }
}

const parallel = (a: Vec, b: Vec) => Math.abs(a.x * b.y - a.y * b.x) < 1e-3

/**
 * Coins à déplacer pour allonger le mur i par son extrémité (forward : coin de droite, sinon de gauche).
 * On cherche le premier mur parallèle et non verrouillé qui absorbera le changement ;
 * les murs entre les deux sont translatés sans changer de longueur.
 */
function absorbRun(room: RoomPlan, i: number, forward: boolean): Set<number> | null {
  const k = room.pts.length
  const dir = wallSeg(room, i).dir
  // 1er essai : un mur parallèle (la forme est conservée) ; sinon le premier mur libre (il pivote)
  for (const needParallel of [true, false]) {
    const run: number[] = []
    // coin qui bouge en premier : extrémité du mur (i+1) ou son départ (i)
    let corner = forward ? (i + 1) % k : i
    for (let n = 1; n < k; n++) {
      run.push(corner)
      // mur au-delà de ce coin
      const w = forward ? corner : (corner - 1 + k) % k
      if (w === i) break
      if (!room.walls[w]?.locked && (!needParallel || parallel(wallSeg(room, w).dir, dir))) return new Set(run)
      corner = (corner + (forward ? 1 : -1) + k) % k
    }
  }
  return null
}

/**
 * Change la longueur du mur i. `side` : le côté qui s'allonge (le coin opposé reste fixe).
 * Le changement est reporté sur le premier mur parallèle non verrouillé (une pièce rectangulaire reste
 * rectangulaire) ; null si impossible (murs verrouillés).
 */
export function setWallLength(room: RoomPlan, i: number, len: number, side: GrowSide = 'right'): RoomPlan | null {
  const s = wallSeg(room, i)
  const delta = len - s.len
  if (Math.abs(delta) < 1e-9) return room
  const parts: [boolean, number][] = side === 'both' ? [[true, delta / 2], [false, delta / 2]] : [[side === 'right', delta]]
  let r = room
  for (const [forward, d] of parts) {
    const run = absorbRun(r, i, forward)
    if (!run) return null
    const sign = forward ? 1 : -1
    // (allongé par la gauche, ses ouvertures restent en place dans la pièce : translateCorners s'en charge)
    r = translateCorners(r, run, { x: s.dir.x * d * sign, y: s.dir.y * d * sign })
  }
  return fitOpenings(r)
}

/**
 * Déplace le coin j en p. Les murs verrouillés qui y touchent sont translatés en bloc
 * (avec leurs voisins verrouillés) pour garder leur longueur et leur orientation.
 */
export function moveCorner(room: RoomPlan, j: number, p: Vec): RoomPlan {
  const k = room.pts.length
  const move = new Set([j])
  // vers la droite : murs j, j+1… verrouillés
  for (let w = j, n = 0; room.walls[w]?.locked && n < k; w = (w + 1) % k, n++) move.add((w + 1) % k)
  // vers la gauche : murs j-1, j-2… verrouillés
  for (let w = (j - 1 + k) % k, n = 0; room.walls[w]?.locked && n < k; w = (w - 1 + k) % k, n++) move.add(w)
  const q = room.pts[j]
  return translateCorners(room, move, { x: p.x - q.x, y: p.y - q.y })
}

/** Ajoute un angle au milieu du mur i (ou au point donné) : le mur est coupé en deux. */
export function splitWall(room: RoomPlan, i: number, newWallId: string, at?: Vec): RoomPlan {
  const s = wallSeg(room, i)
  const t = at ? Math.max(0.1, Math.min(0.9, ((at.x - s.a.x) * s.dir.x + (at.y - s.a.y) * s.dir.y) / s.len)) : 0.5
  const p = { x: round1(s.a.x + s.dir.x * s.len * t), y: round1(s.a.y + s.dir.y * s.len * t) }
  const cut = s.len * t
  const old = room.walls[i]
  const left = old.openings.filter((o) => o.x + o.w / 2 < cut)
  const right = old.openings.filter((o) => o.x + o.w / 2 >= cut).map((o) => ({ ...o, x: o.x - cut }))
  const pts = [...room.pts.slice(0, i + 1), p, ...room.pts.slice(i + 1)]
  const walls = [...room.walls.slice(0, i), { ...old, openings: left }, { id: newWallId, openings: right }, ...room.walls.slice(i + 1)]
  // le nouveau morceau reste lié comme le mur coupé
  const groups = room.groups?.map((g) => (g.walls.includes(old.id) ? { ...g, walls: [...g.walls, newWallId] } : g))
  return fitOpenings({ ...room, pts, walls, ...(groups ? { groups } : {}) })
}

/** Supprime l'angle j : les murs j-1 et j fusionnent (le mur j-1 est conservé). */
export function removeCorner(room: RoomPlan, j: number): RoomPlan {
  const k = room.pts.length
  if (k <= 3) return room
  const prev = (j - 1 + k) % k
  const before = wallSeg(room, prev)
  const after = wallSeg(room, j)
  const pts = room.pts.filter((_, x) => x !== j)
  // ouvertures des deux murs, reprojetées sur le nouveau mur
  const a = room.pts[prev]
  const b = room.pts[(j + 1) % k]
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const proj = (s: WallSeg, o: Opening) => {
    const cx = s.a.x + s.dir.x * (o.x + o.w / 2)
    const cy = s.a.y + s.dir.y * (o.x + o.w / 2)
    return { ...o, x: (cx - a.x) * dir.x + (cy - a.y) * dir.y - o.w / 2 }
  }
  const merged = [...room.walls[prev].openings.map((o) => proj(before, o)), ...room.walls[j].openings.map((o) => proj(after, o))]
  const walls = room.walls.map((w, x) => (x === prev ? { ...w, openings: merged } : w)).filter((_, x) => x !== j)
  return fitOpenings({ ...room, pts, walls })
}

/** Ramène toutes les ouvertures dans les limites de leur mur. */
export function fitOpenings(room: RoomPlan): RoomPlan {
  return {
    ...room,
    walls: room.walls.map((w, i) => {
      const len = wallLength(room, i)
      return { ...w, openings: w.openings.map((o) => clampOpening(o, len, room.height)) }
    }),
  }
}

export function bounds(pts: Vec[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Point du mur i à la distance u de son coin gauche (vu de l'intérieur). */
export const pointOnWall = (s: WallSeg, u: number, inset = 0): Vec => ({ x: s.a.x + s.dir.x * u + s.n.x * inset, y: s.a.y + s.dir.y * u + s.n.y * inset })

/** Le polygone se recoupe-t-il ? (plan invalide) */
export function selfIntersects(pts: Vec[]) {
  const k = pts.length
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  for (let i = 0; i < k; i++) {
    const a = pts[i], b = pts[(i + 1) % k]
    for (let j = i + 2; j < k; j++) {
      if (i === 0 && j === k - 1) continue
      const c = pts[j], d = pts[(j + 1) % k]
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
      if (d1 * d2 < 0 && d3 * d4 < 0) return true
    }
  }
  return false
}

/** L'angle j est-il saillant (convexe) ? Seuls ceux-là peuvent recevoir un décroché. */
export function isConvexCorner(room: RoomPlan, j: number) {
  const a = wallSeg(room, j - 1).dir
  const b = wallSeg(room, j).dir
  return a.x * b.y - a.y * b.x > 1e-6
}

/** Angle saillant le plus « en bas à droite » : celui qu'on entaille par défaut pour faire un L. */
export function defaultNotchCorner(room: RoomPlan) {
  let best = -1
  let score = -Infinity
  room.pts.forEach((p, j) => {
    if (isConvexCorner(room, j) && p.x + p.y > score) {
      score = p.x + p.y
      best = j
    }
  })
  return best
}

const snap5 = (x: number) => Math.max(5, Math.round(x / 5) * 5)

/**
 * Décroché : l'angle j est remplacé par une encoche rentrante (un rectangle devient un L).
 * `a` est pris sur le mur avant l'angle, `b` sur le mur après (par défaut la moitié de chacun).
 * Les deux nouveaux murs reçoivent les identifiants `ids`.
 */
export function notchCorner(room: RoomPlan, j: number, ids: [string, string], a?: number, b?: number): RoomPlan {
  const k = room.pts.length
  const prev = (j - 1 + k) % k
  const sp = wallSeg(room, prev)
  const sn = wallSeg(room, j)
  const da = Math.min(a ?? snap5(sp.len / 2), sp.len - 5)
  const db = Math.min(b ?? snap5(sn.len / 2), sn.len - 5)
  const p = room.pts[j]
  const A = { x: round1(p.x - sp.dir.x * da), y: round1(p.y - sp.dir.y * da) }
  const B = { x: round1(A.x + sn.dir.x * db), y: round1(A.y + sn.dir.y * db) }
  const C = { x: round1(p.x + sn.dir.x * db), y: round1(p.y + sn.dir.y * db) }
  const keepA = sp.len - da
  const walls = room.walls.map((w, x) => {
    if (x === prev) return { ...w, openings: w.openings.filter((o) => o.x + o.w / 2 < keepA) }
    if (x === j) return { ...w, openings: w.openings.filter((o) => o.x + o.w / 2 >= db).map((o) => ({ ...o, x: o.x - db })) }
    return w
  })
  const pts = [...room.pts.slice(0, j), A, B, C, ...room.pts.slice(j + 1)]
  const nextWalls = [...walls.slice(0, j), { id: ids[0], openings: [] }, { id: ids[1], openings: [] }, ...walls.slice(j)]
  // encoche entre deux murs liés ensemble : ses deux murs rejoignent le groupe
  const pid = room.walls[prev].id, nid = room.walls[j].id
  const groups = room.groups?.map((g) => (g.walls.includes(pid) && g.walls.includes(nid) ? { ...g, walls: [...g.walls, ...ids] } : g))
  return fitOpenings({ ...room, pts, walls: nextWalls, ...(groups ? { groups } : {}) })
}

/** Pièce en L : un rectangle w × d entaillé en bas à droite (notchW × notchD). */
export function lRoom(w: number, d: number, wallIds: string[], h = DEFAULT_ROOM.h, notchW = snap5(w / 2), notchD = snap5(d / 2)): RoomPlan {
  const r = rectRoom(w, d, wallIds.slice(0, 4), h)
  // angle 2 = (w, d) : on recule de notchD sur le mur de droite et de notchW sur le mur du bas
  return notchCorner(r, 2, [wallIds[4], wallIds[5]], notchD, notchW)
}

/** Ouverture centrée sur la position u (cm depuis la gauche du mur), aimantée tous les 5 cm. */
export function openingAt(kind: OpeningKind, u: number, len: number, height: number, free = false): Opening {
  const def = OPENING_DEFAULTS[kind]
  const w = Math.min(def.w, Math.max(10, len))
  const raw = u - w / 2
  const x = free ? Math.round(raw) : Math.round(raw / GRID_SNAP) * GRID_SNAP
  return clampOpening({ id: nanoid(8), kind, x, w, h: def.h, sill: def.sill }, len, height)
}
const GRID_SNAP = 5

/**
 * Traverses et montants d'une fenêtre dans le repère du dessin du mur (y vers le bas),
 * pour les aperçus 2D : [x1, y1, x2, y2].
 */
export function windowBars(o: Opening, wallH: number): [number, number, number, number][] {
  if (o.kind !== 'window') return []
  const r = openingRect(o, wallH)
  const cols = windowCols(o), rows = windowRows(o), base = windowBase(o)
  const bottom = r.y + r.h
  const split = bottom - base // haut du soubassement
  const out: [number, number, number, number][] = []
  for (let c = 1; c < cols; c++) {
    const x = r.x + (r.w * c) / cols
    out.push([x, r.y, x, bottom])
  }
  for (let l = 1; l < rows; l++) {
    const y = r.y + ((split - r.y) * l) / rows
    out.push([r.x, y, r.x + r.w, y])
  }
  if (base > 0) out.push([r.x, split, r.x + r.w, split])
  return out
}

/** Groupe (murs liés) auquel appartient le mur. */
export const groupOf = (room: RoomPlan, wallId: string): RoomGroup | undefined => room.groups?.find((g) => g.walls.includes(wallId))

/** Retire des groupes les murs disparus et les groupes de moins de deux murs. */
export function cleanGroups(room: RoomPlan): RoomPlan {
  if (!room.groups) return room
  const ids = new Set(room.walls.map((w) => w.id))
  const seen = new Set<string>()
  const groups = room.groups
    .map((g) => ({ ...g, walls: g.walls.filter((id) => ids.has(id) && !seen.has(id) && (seen.add(id), true)) }))
    .filter((g) => g.walls.length >= 2)
  return { ...room, groups }
}

export interface GroupSeg {
  /** Index du mur dans le plan. */
  i: number
  id: string
  /** Position du mur dans le dessin déroulé (cm). */
  x: number
  len: number
}

export interface GroupLayout {
  /** Largeur totale du dessin déroulé (murs + écarts). */
  width: number
  segs: GroupSeg[]
  /** Écarts entre deux murs non contigus (ex. une cheminée) : pas de mur à peindre. */
  gaps: { x: number; w: number }[]
}

/**
 * Déroulé d'un groupe de murs : les murs dans l'ordre du tour de la pièce, de gauche à droite (vus de
 * l'intérieur). Deux murs qui se touchent sont collés (angle = 0 cm d'écart) ; deux murs séparés
 * (une cheminée entre eux) sont espacés de la distance réelle entre la fin de l'un et le début de l'autre.
 */
export function groupLayout(room: RoomPlan, ids: string[]): GroupLayout {
  const k = room.pts.length
  const idx = ids.map((id) => room.walls.findIndex((w) => w.id === id)).filter((i) => i >= 0).sort((a, b) => a - b)
  if (!idx.length) return { width: 0, segs: [], gaps: [] }
  // on commence après le plus grand trou du tour de la pièce (le déroulé ne fait pas le tour par là)
  let start = 0
  let worst = -1
  idx.forEach((i, n) => {
    const prev = idx[(n - 1 + idx.length) % idx.length]
    const hole = (i - prev - 1 + k) % k
    if (hole > worst) {
      worst = hole
      start = n
    }
  })
  const order = [...idx.slice(start), ...idx.slice(0, start)]
  const segs: GroupSeg[] = []
  const gaps: { x: number; w: number }[] = []
  let x = 0
  order.forEach((i, n) => {
    if (n > 0) {
      const prev = order[n - 1]
      if ((prev + 1) % k !== i) {
        const a = room.pts[(prev + 1) % k], b = room.pts[i]
        const w = round1(Math.hypot(b.x - a.x, b.y - a.y))
        if (w > 0) gaps.push({ x, w })
        x += w
      }
    }
    const len = round1(wallLength(room, i))
    segs.push({ i, id: room.walls[i].id, x, len })
    x += len
  })
  return { width: round1(x), segs, gaps }
}
