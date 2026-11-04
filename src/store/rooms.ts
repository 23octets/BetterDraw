import { nanoid } from 'nanoid'
import { produceWithPatches } from 'immer'
import { db } from './db'
import { recordChange } from './repo'
import { defaultDoc } from '../model/defaults'
import type { DocState, Opening, Project, Rect, RoomGroup, RoomPlan, Variant, Wall } from '../model/types'
import { DEFAULT_ROOM, groupLayout, groupOf, lRoom, rectRoom, wallLength } from '../room/geometry'
import { mergeDocs } from '../room/merge'

const now = () => Date.now()

export function newVariant(projectId: string, wallId: string, w: number, h: number, base?: DocState): Variant {
  const t = now()
  const state = defaultDoc()
  state.wall = { w: Math.max(1, Math.round(w * 10) / 10), h }
  if (base) {
    // un nouveau mur reprend la palette et le fond du mur voisin
    state.palette = structuredClone(base.palette)
    state.background = { ...base.background }
    state.grid = { ...base.grid }
  }
  return { id: nanoid(10), projectId, wallId, name: 'Variante A', createdAt: t, updatedAt: t, headSeq: 0, maxSeq: 0, state }
}

export type RoomShape = 'rect' | 'L'

export async function createRoomProject(
  name: string,
  size: { w: number; d: number; h: number } = { w: DEFAULT_ROOM.w, d: DEFAULT_ROOM.d, h: DEFAULT_ROOM.h },
  shape: RoomShape = 'rect',
) {
  const t = now()
  const pid = nanoid(10)
  const ids = Array.from({ length: shape === 'L' ? 6 : 4 }, () => nanoid(10))
  const room = shape === 'L' ? lRoom(size.w, size.d, ids, size.h) : rectRoom(size.w, size.d, ids, size.h)
  const wallIds = room.walls.map((w) => w.id)
  const project: Project = { id: pid, name, createdAt: t, updatedAt: t, room }
  const variants = wallIds.map((id, i) => newVariant(pid, id, wallLength(room, i), room.height))
  const walls: Wall[] = wallIds.map((id, i) => ({ id, projectId: pid, name: `Mur ${i + 1}`, variantId: variants[i].id }))
  await db.transaction('rw', db.projects, db.walls, db.variants, async () => {
    await db.projects.add(project)
    await db.walls.bulkAdd(walls)
    await db.variants.bulkAdd(variants)
  })
  return project
}

/** Transforme un projet « mur seul » en pièce : le mur existant devient le premier mur. */
export async function convertToRoom(projectId: string) {
  const project = await db.projects.get(projectId)
  if (!project || project.room) return
  const walls = await db.walls.where('projectId').equals(projectId).toArray()
  const variants = await db.variants.where('projectId').equals(projectId).toArray()
  const first = walls[0]
  const v0 = [...variants].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const w = v0?.state.wall.w ?? DEFAULT_ROOM.w
  const h = v0?.state.wall.h ?? DEFAULT_ROOM.h
  const ids = [first?.id ?? nanoid(10), nanoid(10), nanoid(10), nanoid(10)]
  const room = rectRoom(w, DEFAULT_ROOM.d, ids, h)
  await db.transaction('rw', db.projects, db.walls, db.variants, async () => {
    if (!first) await db.walls.add({ id: ids[0], projectId, name: 'Mur 1' })
    else if (v0) await db.walls.update(first.id, { variantId: v0.id })
    for (let i = 1; i < 4; i++) {
      const v = newVariant(projectId, ids[i], wallLength(room, i), h, v0?.state)
      await db.walls.add({ id: ids[i], projectId, name: `Mur ${i + 1}`, variantId: v.id })
      await db.variants.add(v)
    }
    await db.projects.update(projectId, { room, updatedAt: now() })
  })
}

export interface WallInfo {
  wall: Wall
  variants: Variant[]
  /** Variante affichée en 3D. */
  display: Variant | null
}

export function displayVariant(wall: Wall, variants: Variant[]): Variant | null {
  return variants.find((v) => v.id === wall.variantId) ?? [...variants].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
}

/** Murs de la pièce (dans l'ordre du plan) avec leurs variantes. */
export async function loadRoomWalls(project: Project): Promise<WallInfo[]> {
  const walls = await db.walls.where('projectId').equals(project.id).toArray()
  const variants = await db.variants.where('projectId').equals(project.id).toArray()
  const byId = new Map(walls.map((w) => [w.id, w]))
  return (project.room?.walls ?? []).map((rw, i) => {
    const wall = byId.get(rw.id) ?? { id: rw.id, projectId: project.id, name: `Mur ${i + 1}` }
    const vs = variants.filter((v) => v.wallId === rw.id).sort((a, b) => a.createdAt - b.createdAt)
    return { wall, variants: vs, display: displayVariant(wall, vs) }
  })
}

/**
 * Enregistre le plan de la pièce : crée les murs nouveaux (avec une variante vierge)
 * et met chaque variante à la taille de son mur (entrée d'historique dans la variante).
 * Un mur retiré du plan est conservé en base (un « annuler » du plan le retrouve intact).
 */
export async function saveRoom(projectId: string, room: RoomPlan) {
  const walls = await db.walls.where('projectId').equals(projectId).toArray()
  const known = new Set(walls.map((w) => w.id))
  const variants = await db.variants.where('projectId').equals(projectId).toArray()
  let names = walls.length
  const base = [...variants].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.state
  for (let i = 0; i < room.walls.length; i++) {
    const rw = room.walls[i]
    if (known.has(rw.id)) continue
    const v = newVariant(projectId, rw.id, wallLength(room, i), room.height, base)
    await db.transaction('rw', db.walls, db.variants, async () => {
      await db.walls.add({ id: rw.id, projectId, name: `Mur ${++names}`, variantId: v.id })
      await db.variants.add(v)
    })
  }
  await db.projects.update(projectId, { room, updatedAt: now() })
  // tailles des dessins (murs et groupes de murs liés)
  const sizes = [
    ...room.walls.map((rw, i) => ({ id: rw.id, w: Math.round(wallLength(room, i) * 10) / 10 })),
    ...(room.groups ?? []).map((g) => ({ id: g.id, w: groupLayout(room, g.walls).width })),
  ]
  for (const { id, w } of sizes) {
    const h = room.height
    for (const v of variants.filter((x) => x.wallId === id)) {
      const cur = await db.variants.get(v.id)
      if (!cur || (cur.state.wall.w === w && cur.state.wall.h === h)) continue
      const [next, patches, inverse] = produceWithPatches(cur.state, (d) => {
        d.wall.w = w
        d.wall.h = h
      })
      await recordChange(v.id, `Taille du mur (plan de la pièce) : ${w} × ${h} cm`, next, patches, inverse)
    }
  }
}

export async function renameWall(id: string, name: string) {
  await db.walls.update(id, { name })
}

export async function setDisplayVariant(wallId: string, variantId: string) {
  await db.walls.update(wallId, { variantId })
}

/** Dessins des groupes de murs liés, par identifiant de groupe. */
export async function loadRoomGroups(project: Project): Promise<Map<string, WallInfo>> {
  const out = new Map<string, WallInfo>()
  const groups = project.room?.groups ?? []
  if (!groups.length) return out
  const walls = await db.walls.where('projectId').equals(project.id).toArray()
  const variants = await db.variants.where('projectId').equals(project.id).toArray()
  for (const g of groups) {
    const wall = walls.find((w) => w.id === g.id) ?? { id: g.id, projectId: project.id, name: 'Murs liés', group: true }
    const vs = variants.filter((v) => v.wallId === g.id).sort((a, b) => a.createdAt - b.createdAt)
    out.set(g.id, { wall, variants: vs, display: displayVariant(wall, vs) })
  }
  return out
}

/**
 * Lie des murs : crée le dessin du groupe (les dessins des murs y sont recopiés côte à côte).
 * Le plan doit ensuite être enregistré avec ce groupe.
 */
export async function createWallGroup(projectId: string, room: RoomPlan, wallIds: string[]): Promise<RoomGroup> {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Projet introuvable')
  const layout = groupLayout(room, wallIds)
  const infos = await loadRoomWalls({ ...project, room })
  const docs = layout.segs.map((s) => infos[s.i]?.display?.state ?? null)
  const names = layout.segs.map((s) => infos[s.i]?.wall.name ?? '?')
  const id = nanoid(10)
  const v = newVariant(projectId, id, layout.width, room.height)
  v.state = mergeDocs(layout, room.height, docs)
  await db.transaction('rw', db.walls, db.variants, async () => {
    await db.walls.add({ id, projectId, name: names.join(' + '), variantId: v.id, group: true })
    await db.variants.add(v)
  })
  return { id, walls: layout.segs.map((s) => s.id) }
}

/** Surface qu'on peint : un mur seul, ou un groupe de murs liés. */
export interface RoomSurface {
  id: string
  name: string
  variantId: string | null
}

export interface RoomContext {
  project: Project
  room: RoomPlan
  /** Position de la surface ouverte dans `walls`. */
  index: number
  /** Surfaces à peindre dans l'ordre du tour de la pièce (un groupe remplace ses murs). */
  walls: RoomSurface[]
  /** Ouvertures dans le repère du dessin. */
  openings: Opening[]
  /** Zones sans mur (écart entre deux murs liés non contigus). */
  masks: Rect[]
  /** Jonctions entre murs liés : position et nom du mur qui commence là. */
  seams: { x: number; name: string }[]
}

/** Surfaces à peindre, dans l'ordre du plan. */
export function roomSurfaces(room: RoomPlan, infos: WallInfo[], groups: Map<string, WallInfo>): RoomSurface[] {
  const out: RoomSurface[] = []
  const done = new Set<string>()
  room.walls.forEach((rw, i) => {
    const g = groupOf(room, rw.id)
    if (g) {
      if (done.has(g.id)) return
      done.add(g.id)
      const info = groups.get(g.id)
      out.push({ id: g.id, name: info?.wall.name ?? 'Murs liés', variantId: info?.display?.id ?? null })
    } else out.push({ id: rw.id, name: infos[i]?.wall.name ?? `Mur ${i + 1}`, variantId: infos[i]?.display?.id ?? null })
  })
  return out
}

/** Contexte « pièce » d'une variante (null si le projet est un mur seul). */
export async function roomContext(variant: Variant): Promise<RoomContext | null> {
  const project = await db.projects.get(variant.projectId)
  if (!project?.room) return null
  const room = project.room
  const infos = await loadRoomWalls(project)
  const groups = await loadRoomGroups(project)
  const walls = roomSurfaces(room, infos, groups)
  const index = walls.findIndex((w) => w.id === variant.wallId)
  if (index < 0) return null
  const group = room.groups?.find((g) => g.id === variant.wallId)
  if (!group) {
    const i = room.walls.findIndex((w) => w.id === variant.wallId)
    return { project, room, index, walls, openings: room.walls[i].openings, masks: [], seams: [] }
  }
  const layout = groupLayout(room, group.walls)
  return {
    project,
    room,
    index,
    walls,
    openings: layout.segs.flatMap((s) => room.walls[s.i].openings.map((o) => ({ ...o, x: o.x + s.x }))),
    masks: layout.gaps.map((g) => ({ x: g.x, y: 0, w: g.w, h: room.height })),
    seams: layout.segs.map((s) => ({ x: s.x, name: infos[s.i]?.wall.name ?? '' })),
  }
}
