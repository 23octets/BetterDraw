import { nanoid } from 'nanoid'
import { produceWithPatches } from 'immer'
import { db, markStandaloneWalls } from './db'
import { recordChange } from './repo'
import { defaultDoc } from '../model/defaults'
import type { DocState, Opening, Project, Rect, RoomGroup, RoomPlan, Variant, Wall } from '../model/types'
import { DEFAULT_ROOM, groupLayout, groupOf, lRoom, rectRoom, wallLength } from '../room/geometry'
import { mergeDocs } from '../room/merge'
import { translateShapes } from '../geometry/edit'

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
  /** Ajoute aussi un mur 2D indépendant de cette taille (projet « pièce + mur 2D »). */
  wall2d?: { w: number; h: number },
) {
  const t = now()
  const pid = nanoid(10)
  const ids = Array.from({ length: shape === 'L' ? 6 : 4 }, () => nanoid(10))
  const room = shape === 'L' ? lRoom(size.w, size.d, ids, size.h) : rectRoom(size.w, size.d, ids, size.h)
  const wallIds = room.walls.map((w) => w.id)
  const project: Project = { id: pid, name, createdAt: t, updatedAt: t, room }
  const variants = wallIds.map((id, i) => newVariant(pid, id, wallLength(room, i), room.height))
  const walls: Wall[] = wallIds.map((id, i) => ({ id, projectId: pid, name: `Mur ${i + 1}`, variantId: variants[i].id }))
  if (wall2d) {
    const id = nanoid(10)
    const v = newVariant(pid, id, wall2d.w, wall2d.h)
    variants.push(v)
    walls.push({ id, projectId: pid, name: 'Mur 2D', variantId: v.id, standalone: true })
  }
  await db.transaction('rw', db.projects, db.walls, db.variants, async () => {
    await db.projects.add(project)
    await db.walls.bulkAdd(walls)
    await db.variants.bulkAdd(variants)
  })
  return project
}

/**
 * Ajoute une pièce 3D à un projet « mur 2D seul ». Le mur 2D est conservé ; le premier mur
 * de la pièce, à sa largeur et à sa hauteur, reçoit une copie de son dessin.
 */
export async function addRoom(projectId: string) {
  const project = await db.projects.get(projectId)
  if (!project || project.room) return
  const variants = await db.variants.where('projectId').equals(projectId).toArray()
  const v0 = [...variants].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const w = v0?.state.wall.w ?? DEFAULT_ROOM.w
  const h = v0?.state.wall.h ?? DEFAULT_ROOM.h
  const ids = [nanoid(10), nanoid(10), nanoid(10), nanoid(10)]
  const room = rectRoom(w, DEFAULT_ROOM.d, ids, h)
  const existing = await db.walls.where('projectId').equals(projectId).toArray()
  await db.transaction('rw', db.projects, db.walls, db.variants, async () => {
    for (const wall of existing) if (!wall.group && !wall.standalone) await db.walls.update(wall.id, { standalone: true })
    for (let i = 0; i < 4; i++) {
      const v = newVariant(projectId, ids[i], wallLength(room, i), h, v0?.state)
      if (i === 0 && v0) v.state = { ...structuredClone(v0.state), wall: { w: v.state.wall.w, h } }
      await db.walls.add({ id: ids[i], projectId, name: `Mur ${i + 1}`, variantId: v.id })
      await db.variants.add(v)
    }
    await db.projects.update(projectId, { room, updatedAt: now() })
  })
}

/** Ajoute un mur 2D indépendant à une pièce (projet « pièce + mur 2D »). */
export async function addStandaloneWall(projectId: string, size?: { w: number; h: number }) {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Projet introuvable')
  const variants = await db.variants.where('projectId').equals(projectId).toArray()
  const base = [...variants].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.state
  const w = size?.w ?? (project.room ? Math.round(wallLength(project.room, 0)) : DEFAULT_ROOM.w)
  const h = size?.h ?? project.room?.height ?? DEFAULT_ROOM.h
  const id = nanoid(10)
  const v = newVariant(projectId, id, w, h, base)
  await db.transaction('rw', db.projects, db.walls, db.variants, async () => {
    await db.walls.add({ id, projectId, name: 'Mur 2D', variantId: v.id, standalone: true })
    await db.variants.add(v)
    await db.projects.update(projectId, { updatedAt: now() })
  })
  return v
}

/** Mur où l'on peut peindre une fresque : mur 2D, mur du plan ou groupe de murs liés. */
export interface FrescoSource {
  project: Project
  wall: Wall
  variants: Variant[]
}

/** Murs actifs de tous les projets (pas ceux retirés du plan), avec leurs variantes. */
export async function listFrescoSources(): Promise<FrescoSource[]> {
  const projects = await db.projects.orderBy('updatedAt').reverse().toArray()
  const out: FrescoSource[] = []
  for (const project of projects) {
    const walls = await db.walls.where('projectId').equals(project.id).toArray()
    const variants = await db.variants.where('projectId').equals(project.id).toArray()
    const room = project.room
    const order = (w: Wall) => {
      if (w.standalone || !room) return -1
      const i = room.walls.findIndex((x) => x.id === w.id)
      if (i >= 0) return i
      const g = room.groups?.findIndex((x) => x.id === w.id) ?? -1
      return g >= 0 ? room.walls.length + g : null
    }
    const active = markStandaloneWalls(project, walls)
      .map((w) => ({ w, k: order(w) }))
      .filter((x): x is { w: Wall; k: number } => x.k !== null)
      .sort((a, b) => a.k - b.k)
    for (const { w } of active) {
      const vs = variants.filter((v) => v.wallId === w.id).sort((a, b) => a.createdAt - b.createdAt)
      if (vs.length) out.push({ project, wall: w, variants: vs })
    }
  }
  return out
}

/**
 * Fresque mise à la taille d'un autre mur, posée au sol (coin bas gauche) : le dessin garde ses cotes,
 * ce qui dépasse du mur reste dans le dessin, hors du mur.
 */
export function fitFresco(doc: DocState, size: { w: number; h: number }): DocState {
  const out = structuredClone(doc)
  const dy = size.h - doc.wall.h
  out.wall = { ...size }
  if (dy !== 0) {
    out.shapes = translateShapes(out.shapes, { x: 0, y: dy })
    out.fills = out.fills.map((f) => ({ ...f, seed: { x: f.seed.x, y: f.seed.y + dy } }))
    out.images = out.images.map((im) => ({ ...im, y: im.y + dy }))
  }
  // les cases à imprimer dépendent de la taille du mur
  if (size.w !== doc.wall.w || size.h !== doc.wall.h) out.printCells = []
  return out
}

/**
 * Copie une fresque (une variante d'un autre mur, de ce projet ou d'un autre) dans un mur :
 * elle devient une nouvelle variante de ce mur, affichée en 3D. Rien n'est écrasé.
 * `size` impose la taille du mur cible (mur de pièce : taille fixée par le plan) ;
 * sans `size`, la fresque garde ses dimensions.
 */
export async function copyFresco(sourceVariantId: string, target: { projectId: string; wallId: string; size?: { w: number; h: number } }) {
  const src = await db.variants.get(sourceVariantId)
  if (!src) throw new Error('Fresque introuvable')
  const srcWall = await db.walls.get(src.wallId)
  const t = now()
  const state = target.size ? fitFresco(src.state, target.size) : structuredClone(src.state)
  const v: Variant = {
    id: nanoid(10), projectId: target.projectId, wallId: target.wallId,
    name: `Copie de ${srcWall?.name ?? 'mur'} · ${src.name}`.slice(0, 120),
    createdAt: t, updatedAt: t, headSeq: 0, maxSeq: 0, state,
  }
  await db.transaction('rw', db.projects, db.walls, db.variants, async () => {
    await db.variants.add(v)
    await db.walls.update(target.wallId, { variantId: v.id })
    await db.projects.update(target.projectId, { updatedAt: t })
  })
  return v
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
      await recordChange(v.id, `Taille du mur (plan de la pièce) : ${w} × ${h} cm`, next, patches, inverse, cur)
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
