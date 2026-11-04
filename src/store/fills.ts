import { excludedArea, type WallContext } from '../geometry/paintable'
import { nanoid } from 'nanoid'
import { current } from 'immer'
import type { DocState, Fill, Shape, Vec } from '../model/types'
import { buildRegions, faceRegion, regionAt, type Region } from '../geometry/regions'
import { getPaper, toPaperPath } from '../geometry/paperScope'
import { applyMat, type Mat } from '../geometry/vec'
import { registerAfterChange } from './editor'

export interface ResolvedFill {
  fill: Fill
  region: Region
  hex: string
}

const resolveCache = new WeakMap<Fill[], { shapes: Shape[]; wall: DocState['wall']; palette: DocState['palette']; out: ResolvedFill[] }>()

/** Associe chaque remplissage à sa région actuelle. */
export function resolveFills(doc: Pick<DocState, 'shapes' | 'wall' | 'fills' | 'palette'>): ResolvedFill[] {
  const c = resolveCache.get(doc.fills)
  if (c && c.shapes === doc.shapes && c.wall === doc.wall && c.palette === doc.palette) return c.out
  const graph = buildRegions(doc.shapes, doc.wall)
  const out: ResolvedFill[] = []
  const seenFace = new Map<number, number>()
  for (const f of doc.fills) {
    const region = regionAt(graph, f.seed)
    if (!region) continue
    const hex = doc.palette.find((p) => p.id === f.colorId)?.hex ?? '#999'
    const prev = seenFace.get(region.faceIndex)
    if (prev !== undefined) out[prev] = { fill: f, region, hex }
    else {
      seenFace.set(region.faceIndex, out.length)
      out.push({ fill: f, region, hex })
    }
  }
  resolveCache.set(doc.fills, { shapes: doc.shapes, wall: doc.wall, palette: doc.palette, out })
  return out
}

function interiorOf(item: paper.PathItem): Vec {
  const p = (item as paper.Path).interiorPoint
  return { x: p.x, y: p.y }
}

function boundsOverlap(a: paper.Rectangle, b: paper.Rectangle) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

export interface Carry {
  ids: Set<string>
  m: Mat
}
let pendingCarry: Carry | null = null
/** À appeler juste avant un commit qui transforme des formes : les zones qu'elles enferment suivent. */
export function setPendingCarry(c: Carry | null) {
  pendingCarry = c
}

/** La région est-elle entièrement bordée par les formes transformées ? */
function enclosedBy(region: Region, shapes: Shape[]): boolean {
  if (!shapes.length) return false
  const P = getPaper()
  const paths = shapes.map(toPaperPath)
  const children = (region.item as paper.CompoundPath).children ?? [region.item]
  for (const child of children as paper.Path[]) {
    const L = child.length
    const n = Math.max(12, Math.ceil(L / 5))
    for (let i = 0; i < n; i++) {
      const pt = child.getPointAt((i / n) * L)
      if (!pt) continue
      if (!paths.some((p) => p.getNearestPoint(new P.Point(pt.x, pt.y)).getDistance(pt) < 0.05)) return false
    }
  }
  return true
}

/**
 * Après une modification géométrique, la couleur suit sa zone :
 * - les zones enfermées par des formes déplacées/transformées suivent la transformation ;
 * - sinon, chaque nouvelle zone prend la couleur de l'ancienne zone colorée qui couvre
 *   plus de la moitié de sa surface (une zone coupée en deux garde la couleur des deux côtés,
 *   une zone qui disparaît dans une plus grande perd la sienne).
 */
export function remapFills(
  before: Pick<DocState, 'shapes' | 'wall' | 'fills' | 'palette'>,
  after: Pick<DocState, 'shapes' | 'wall'>,
  carry: Carry | null = null,
): Fill[] {
  const old = resolveFills(before)
  if (!old.length) return []
  const graph = buildRegions(after.shapes, after.wall)
  const out: Fill[] = []
  const assigned = new Set<number>()
  let candidates = old.map((o) => ({ colorId: o.fill.colorId as string | null, region: o.region }))

  if (carry) {
    const moved = before.shapes.filter((s) => carry.ids.has(s.id))
    const oldGraph = buildRegions(before.shapes, before.wall)
    const colored = new Map(old.map((o) => [o.region.faceIndex, o.fill.colorId]))
    const carriedFaces = new Set<number>()
    oldGraph.faces.forEach((_, k) => {
      const region = faceRegion(oldGraph, k)
      if (!enclosedBy(region, moved)) return
      carriedFaces.add(k)
      const seed = applyMat(carry.m, interiorOf(region.item))
      const nr = regionAt(graph, seed)
      if (!nr || assigned.has(nr.faceIndex)) return
      assigned.add(nr.faceIndex)
      const colorId = colored.get(k)
      if (colorId) out.push({ id: nanoid(8), seed: interiorOf(nr.item), colorId })
    })
    candidates = candidates.filter((c) => !carriedFaces.has(c.region.faceIndex))
    // les zones transportées non peintes restent non peintes : on les retire aussi des sources
  }

  graph.faces.forEach((face, k) => {
    if (assigned.has(k)) return
    if (face.interior.x < 0 || face.interior.y < 0 || face.interior.x > after.wall.w || face.interior.y > after.wall.h) return
    const region = faceRegion(graph, k)
    if (region.area < 1e-3) return
    // part de la nouvelle zone couverte par chaque couleur (en additionnant tous les anciens
    // morceaux de cette couleur : une zone recoupée puis refondue garde sa couleur)
    const share = new Map<string, number>()
    for (const o of candidates) {
      if (!o.colorId || !boundsOverlap(o.region.item.bounds, region.item.bounds)) continue
      const inter = region.item.intersect(o.region.item, { insert: false })
      const a = Math.abs((inter as paper.Path).area)
      if (a < 1e-3) continue
      share.set(o.colorId, (share.get(o.colorId) ?? 0) + a / region.area)
    }
    // la couleur la plus représentée l'emporte, si elle couvre plus que la part non peinte
    const painted = [...share.values()].reduce((x, y) => x + y, 0)
    const unpainted = Math.max(0, 1 - painted)
    let best: { colorId: string; score: number } | null = null
    for (const [colorId, score] of share) if (!best || score > best.score) best = { colorId, score }
    if (best && best.score > unpainted) out.push({ id: nanoid(8), seed: interiorOf(region.item), colorId: best.colorId })
  })
  return out
}

registerAfterChange((before, draft) => {
  const carry = pendingCarry
  pendingCarry = null
  if (!before.fills.length) return
  const now = current(draft)
  if (now.shapes === before.shapes && now.wall.w === before.wall.w && now.wall.h === before.wall.h) return
  if (JSON.stringify(now.shapes) === JSON.stringify(before.shapes) && now.wall.w === before.wall.w && now.wall.h === before.wall.h) return
  draft.fills = remapFills({ ...before, fills: now.fills }, now, carry)
})

/** Peint la zone contenant p avec la couleur donnée (remplace la couleur existante). */
export function fillAt(doc: DocState, p: Vec, colorId: string): { fills: Fill[]; region: Region } | null {
  const graph = buildRegions(doc.shapes, doc.wall)
  const region = regionAt(graph, p)
  if (!region) return null
  const existing = resolveFills(doc).filter((r) => r.region.faceIndex !== region.faceIndex).map((r) => r.fill)
  return { fills: [...existing, { id: nanoid(8), seed: interiorOf(region.item), colorId }], region }
}

export function eraseAt(doc: DocState, p: Vec): Fill[] | null {
  const graph = buildRegions(doc.shapes, doc.wall)
  const region = regionAt(graph, p)
  if (!region) return null
  const resolved = resolveFills(doc)
  if (!resolved.some((r) => r.region.faceIndex === region.faceIndex)) return null
  return resolved.filter((r) => r.region.faceIndex !== region.faceIndex).map((r) => r.fill)
}

export function colorAt(doc: DocState, p: Vec): string | null {
  const graph = buildRegions(doc.shapes, doc.wall)
  const region = regionAt(graph, p)
  if (!region) return null
  return resolveFills(doc).find((r) => r.region.faceIndex === region.faceIndex)?.fill.colorId ?? null
}

export interface ColorSurface {
  colorId: string
  name: string
  hex: string
  area: number // cm²
  liters: number
}

/** Surfaces par couleur (m² via area/10000) et litres estimés. */
export function surfaces(doc: DocState, room?: WallContext | null): { colors: ColorSurface[]; background: { area: number; liters: number }; total: number } {
  const resolved = resolveFills(doc)
  const excluded = excludedArea(doc, room)
  const total = doc.wall.w * doc.wall.h - (excluded ? Math.abs((excluded as paper.Path).area) : 0)
  const by = new Map<string, number>()
  for (const r of resolved) by.set(r.fill.colorId, (by.get(r.fill.colorId) ?? 0) + (excluded ? Math.abs((r.region.item.subtract(excluded, { insert: false }) as paper.Path).area) : r.region.area))
  const liters = (cm2: number) => (cm2 / 10000) * doc.paint.coats / Math.max(0.1, doc.paint.coverage)
  const colors = doc.palette
    .filter((c) => by.has(c.id))
    .map((c) => ({ colorId: c.id, name: c.name, hex: c.hex, area: by.get(c.id)!, liters: liters(by.get(c.id)!) }))
  const painted = [...by.values()].reduce((a, b) => a + b, 0)
  const bgArea = Math.max(0, total - painted)
  return { colors, background: { area: bgArea, liters: liters(bgArea) }, total }
}
