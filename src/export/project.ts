import { applyPatches, enablePatches, type Patch } from 'immer'
import { flushPersistence } from '../store/editor'
import { nanoid } from 'nanoid'
import { db } from '../store/db'
import type { DocState, GridSettings, HistoryEntry, ImageEdit, Opening, Project, Rect, RoomPlan, Segment, Shape, StoredImage, Variant, Vec, Wall } from '../model/types'

export interface ProjectFile {
  format: 'frsque-project'
  version: 1
  exportedAt: number
  project: Project
  walls: Wall[]
  variants: Variant[]
  entries: HistoryEntry[]
  images: StoredImage[]
  warnings?: string[]
}

/** Exporte un projet complet : variantes, historique et images. */
export async function serializeProject(projectId: string): Promise<ProjectFile> {
  await flushPersistence()
  return db.transaction('r', [db.projects, db.walls, db.variants, db.entries, db.images], async () => {
    const project = await db.projects.get(projectId)
    if (!project) throw new Error('Projet introuvable')
    const walls = await db.walls.where('projectId').equals(projectId).toArray()
    const variants = await db.variants.where('projectId').equals(projectId).toArray()
    const entries = (await Promise.all(variants.map((v) => db.entries.where('variantId').equals(v.id).toArray()))).flat()
    const blobIds = new Set<string>()
    const collect = (x: unknown): void => {
      if (!x || typeof x !== 'object') return
      for (const [key, value] of Object.entries(x)) {
        if ((key === 'blobId' || key === 'sourceBlobId') && typeof value === 'string') blobIds.add(value)
        else collect(value)
      }
    }
    collect(variants.map((v) => v.state))
    collect(entries)
    for (const e of entries) for (const raw of [...e.patches, ...e.inverse]) {
      const patch = raw as Patch
      if (patch.op !== 'remove' && ['blobId', 'sourceBlobId'].includes(String(patch.path.at(-1))) && typeof patch.value === 'string') blobIds.add(patch.value)
    }
    const images = await db.images.bulkGet([...blobIds])
    const warnings = images.some((im) => !im)
      ? ['Certaines images sont absentes de ce projet. La sauvegarde conserve les données disponibles ; sa restauration pourra nécessiter une récupération sans historique.']
      : []
    const complete = images.filter((im): im is StoredImage => !!im)
    // Le fichier conserve même un historique local abîmé : l'import proposera sa récupération.
    // Ne pas reconstruire l'historique dans la transaction de lecture (coût et blocage de l'interface).
    return { format: 'frsque-project', version: 1, exportedAt: Date.now(), project, walls, variants, entries, images: complete, ...(warnings.length ? { warnings } : {}) }
  })
}

// ---------- Validation stricte de l'import (le fichier vient de l'extérieur) ----------

class ImportError extends Error {}
const fail = (what: string): never => {
  throw new ImportError(`Fichier invalide (${what})`)
}
const num = (x: unknown, what: string, min = -1e7, max = 1e7): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : fail(what)
const str = (x: unknown, what: string, max = 200): string => (typeof x === 'string' && x.length <= max ? x : fail(what))
const bool = (x: unknown, what: string): boolean => (typeof x === 'boolean' ? x : fail(what))
const hex = (x: unknown, what: string): string => (typeof x === 'string' && /^#[0-9a-f]{3,8}$/i.test(x) ? x : fail(what))
const arr = (x: unknown, what: string, max = 100000): unknown[] => (Array.isArray(x) && x.length <= max ? x : fail(what))
const obj = (x: unknown, what: string): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : fail(what))
const vec = (x: unknown): Vec => {
  const o = obj(x, 'point')
  return { x: num(o.x, 'point'), y: num(o.y, 'point') }
}

function segment(x: unknown): Segment {
  const o = obj(x, 'segment')
  if (o.t === 'line') return { t: 'line' }
  if (o.t === 'arc') return { t: 'arc', bulge: num(o.bulge, 'arc', -1e4, 1e4) }
  if (o.t === 'cubic') return { t: 'cubic', c1: vec(o.c1), c2: vec(o.c2) }
  return fail('segment')
}

const rect = (x: unknown, what: string): Rect => {
  const o = obj(x, what)
  return { x: num(o.x, what), y: num(o.y, what), w: num(o.w, what, 0, 1e7), h: num(o.h, what, 0, 1e7) }
}

function sanitizeEdit(x: unknown): ImageEdit {
  const e = obj(x, 'retouche')
  const quad = arr(e.quad, 'retouche', 4).map(vec)
  if (quad.length !== 4) fail('retouche')
  const full = obj(e.full, 'retouche')
  let realSize: ImageEdit['realSize'] = null
  if (e.realSize !== null && e.realSize !== undefined) {
    const r = obj(e.realSize, 'retouche')
    realSize = { w: num(r.w, 'retouche', 0.01, 1e6), h: num(r.h, 'retouche', 0.01, 1e6) }
  }
  return {
    sourceBlobId: str(e.sourceBlobId, 'id', 40),
    quad,
    realSize,
    full: { w: num(full.w, 'retouche', 1, 1e6), h: num(full.h, 'retouche', 1, 1e6) },
    rect: rect(e.rect, 'retouche'),
    crop: rect(e.crop, 'retouche'),
  }
}

export function sanitizeDoc(x: unknown): DocState {
  const o = obj(x, 'dessin')
  const wall = obj(o.wall, 'mur')
  const grid = obj(o.grid, 'grille')
  const bg = obj(o.background, 'fond')
  const paint = obj(o.paint, 'peinture')
  const origin = grid.origin
  if (origin !== 'bl' && origin !== 'tl' && origin !== 'br' && origin !== 'tr') fail('origine')
  const shapes = arr(o.shapes, 'formes').map((sx): Shape => {
    const s = obj(sx, 'forme')
    const pts = arr(s.pts, 'points').map(vec)
    const closed = bool(s.closed, 'forme')
    const segs = arr(s.segs, 'segments').map(segment)
    if (segs.length !== (closed ? pts.length : Math.max(0, pts.length - 1))) fail('segments')
    return { id: str(s.id, 'id', 40), pts, segs, closed }
  })
  return {
    wall: { w: num(wall.w, 'mur', 1, 100000), h: num(wall.h, 'mur', 1, 100000) },
    grid: { step: num(grid.step, 'grille', 0.1, 100000), origin: origin as GridSettings['origin'], snapStep: num(grid.snapStep, 'grille', 0.01, 100000), ...(grid.stepY === undefined ? {} : { stepY: num(grid.stepY, 'grille', 0.1, 100000) }), show: bool(grid.show, 'grille'), subStep: grid.subStep === undefined ? 10 : num(grid.subStep, 'grille', 0.1, 100000), lineWidth: grid.lineWidth === undefined ? 1 : num(grid.lineWidth, 'grille', 0.1, 10), lineOpacity: grid.lineOpacity === undefined ? 1 : num(grid.lineOpacity, 'grille', 0, 1), lineStyle: grid.lineStyle === undefined ? 'dashed' : (['solid', 'dashed', 'dotted', 'longdash', 'dashdot'].includes(grid.lineStyle as string) ? (grid.lineStyle as GridSettings['lineStyle']) : fail('grille')) },
    shapes,
    fills: arr(o.fills, 'zones').map((fx) => {
      const f = obj(fx, 'zone')
      return { id: str(f.id, 'id', 40), seed: vec(f.seed), colorId: str(f.colorId, 'couleur', 40) }
    }),
    palette: arr(o.palette, 'palette', 500).map((cx) => {
      const c = obj(cx, 'couleur')
      return { id: str(c.id, 'id', 40), name: str(c.name, 'nom'), hex: hex(c.hex, 'couleur') }
    }),
    background: { hex: hex(bg.hex, 'fond'), repaint: bool(bg.repaint, 'fond') },
    paint: { coverage: num(paint.coverage, 'rendement', 0.01, 1000), coats: num(paint.coats, 'couches', 1, 20), showLiters: bool(paint.showLiters, 'litres') },
    images: arr(o.images, 'images', 500).map((ix) => {
      const i = obj(ix, 'image')
      return {
        id: str(i.id, 'id', 40), blobId: str(i.blobId, 'id', 40), name: str(i.name, 'nom', 300),
        x: num(i.x, 'image'), y: num(i.y, 'image'), w: num(i.w, 'image', 0, 1e7), h: num(i.h, 'image', 0, 1e7),
        opacity: num(i.opacity, 'opacité', 0, 1), locked: bool(i.locked, 'image'), visible: bool(i.visible, 'image'),
        ...(i.edit === undefined ? {} : { edit: sanitizeEdit(i.edit) }),
      }
    }),
    printCells: arr(o.printCells, 'cases', 10000).map((c) => {
      const id = str(c, 'case', 12)
      return /^[A-Z]{1,4}\d{1,5}$/.test(id) ? id : fail('case')
    }),
  }
}

/** Plan de pièce importé ; les murs sont renommés via `wallId`. */
export function sanitizeRoom(x: unknown, wallId: (id: string) => string | undefined): RoomPlan {
  const o = obj(x, 'pièce')
  const pts = arr(o.pts, 'pièce', 500).map(vec)
  const walls = arr(o.walls, 'pièce', 500).map((wx) => {
    const w = obj(wx, 'mur')
    const id = wallId(str(w.id, 'id', 40)) ?? fail('mur')
    const openings = arr(w.openings, 'ouvertures', 200).map((ox): Opening => {
      const op = obj(ox, 'ouverture')
      if (op.kind !== 'door' && op.kind !== 'window') fail('ouverture')
      const out: Opening = { id: str(op.id, 'id', 40), kind: op.kind as Opening['kind'], x: num(op.x, 'ouverture'), w: num(op.w, 'ouverture', 0, 1e5), h: num(op.h, 'ouverture', 0, 1e5), sill: num(op.sill, 'ouverture', 0, 1e5) }
      if (op.cols !== undefined) out.cols = Math.round(num(op.cols, 'ouverture', 1, 12))
      if (op.rows !== undefined) out.rows = Math.round(num(op.rows, 'ouverture', 1, 12))
      if (op.base !== undefined) out.base = num(op.base, 'ouverture', 0, 1e5)
      return out
    })
    return w.locked === true ? { id, openings, locked: true } : { id, openings }
  })
  if (pts.length < 3 || walls.length !== pts.length) fail('pièce')
  const room: RoomPlan = { pts, walls, height: num(o.height, 'pièce', 10, 10000), thickness: num(o.thickness, 'pièce', 0.5, 1000), floor: hex(o.floor, 'sol') }
  if (o.groups !== undefined) {
    const members = new Set(walls.map((w) => w.id))
    room.groups = arr(o.groups, 'murs liés', 500).map((gx) => {
      const g = obj(gx, 'murs liés')
      const id = wallId(str(g.id, 'id', 40)) ?? fail('murs liés')
      const ids = arr(g.walls, 'murs liés', 500).map((x) => wallId(str(x, 'id', 40)) ?? fail('murs liés'))
      if (ids.some((x) => !members.has(x))) fail('murs liés')
      return { id, walls: ids }
    })
  }
  return room
}

const IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/

function sanitizePatches(x: unknown): unknown[] {
  return arr(x, 'historique', 1_000_000).map((px) => {
    const p = obj(px, 'historique')
    const op = p.op
    if (op !== 'add' && op !== 'remove' && op !== 'replace') fail('historique')
    const path = arr(p.path, 'historique', 50).map((k) => {
      if (typeof k === 'number') return num(k, 'historique', 0, 1e7)
      const key = str(k, 'historique', 40)
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('historique')
      return key
    })
    // la valeur est un fragment JSON : on le clone pour ne garder que des données pures
    return 'value' in p ? { op, path, value: JSON.parse(JSON.stringify(p.value ?? null)) } : { op, path }
  })
}

enablePatches()

export class InvalidHistoryError extends Error {
  constructor() {
    super('Fichier invalide (historique corrompu ou images absentes). Vous pouvez importer le dessin actuel sans historique ; les images indisponibles seront retirées.')
  }
}

function checkReferences(state: DocState, images: Set<string>) {
  for (const im of state.images) {
    if (!images.has(im.blobId) || (im.edit && !images.has(im.edit.sourceBlobId))) fail('image référencée absente')
  }
  // Une couleur supprimée utilisait déjà le gris de secours dans les anciens fichiers.
}

/** Deux parcours linéaires ; aucun tableau de snapshots n'est conservé. */
export async function validateHistory(variants: Variant[], entries: HistoryEntry[], images: Set<string>) {
  const grouped = new Map<string, HistoryEntry[]>()
  for (const e of entries) {
    const list = grouped.get(e.variantId) ?? []
    list.push(e)
    grouped.set(e.variantId, list)
  }
  const ids = new Set(variants.map((v) => v.id))
  if (entries.some((e) => !ids.has(e.variantId))) fail('référence historique')
  const check = (state: unknown) => {
    const doc = sanitizeDoc(state)
    checkReferences(doc, images)
    return doc
  }
  let deadline = performance.now() + 12
  const breathe = async () => {
    if (performance.now() < deadline) return
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    deadline = performance.now() + 12
  }
  for (const v of variants) {
    if (!Number.isInteger(v.headSeq) || !Number.isInteger(v.maxSeq) || v.headSeq < 0 || v.headSeq > v.maxSeq) fail('séquence historique')
    const es = (grouped.get(v.id) ?? []).sort((a, b) => a.seq - b.seq)
    if (es.length !== v.maxSeq || es.some((e, i) => e.seq !== i + 1)) fail('séquence historique')
    let state = check(v.state)
    const headJson = JSON.stringify(state)
    for (let i = v.headSeq - 1; i >= 0; i--) {
      state = check(applyPatches(state, es[i].inverse as Patch[]))
      await breathe()
    }
    let stateJson = JSON.stringify(state)
    for (let i = 0; i < es.length; i++) {
      const next = check(applyPatches(state, es[i].patches as Patch[]))
      const previous = check(applyPatches(next, es[i].inverse as Patch[]))
      if (JSON.stringify(previous) !== stateJson) fail('patch inverse incohérent')
      state = next
      stateJson = JSON.stringify(state)
      if (i + 1 === v.headSeq && stateJson !== headJson) fail('état historique incohérent')
      await breathe()
    }
  }
}

/** Formats lisibles à l'import : les sauvegardes faites sous l'ancien nom de l'app restent valables. */
const PROJECT_FORMATS: unknown[] = ['frsque-project', 'betterdraw-project']

/** Importe un fichier projet comme nouveau projet (nouveaux identifiants, rien n'est écrasé). */
export async function importProject(data: unknown, options: { withoutHistory?: boolean } = {}): Promise<{ project: Project; variants: Variant[] }> {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  if (!root || !PROJECT_FORMATS.includes(root.format) || !root.project || !Array.isArray(root.variants)) throw new Error('Ce fichier n’est pas un projet frsque')
  if (root.version !== 1) throw new Error('Version de sauvegarde non prise en charge : ' + String(root.version))
  const p0 = obj(root.project, 'projet')
  const now = Date.now()
  const pid = nanoid(10)
  const project: Project = { id: pid, name: str(p0.name, 'nom'), createdAt: num(p0.createdAt, 'date', 0, 1e14), updatedAt: now }
  const wallsIn = arr(root.walls ?? [], 'murs', 500).map((w) => obj(w, 'mur'))
  const wallIds = new Map(wallsIn.map((w) => [str(w.id, 'id', 40), nanoid(10)]))
  const variantsIn = arr(root.variants, 'variantes', 5000).map((v) => obj(v, 'variante'))
  const varIds = new Map(variantsIn.map((v) => [str(v.id, 'id', 40), nanoid(10)]))
  if (wallIds.size !== wallsIn.length || varIds.size !== variantsIn.length) fail('identifiants dupliqués')
  const walls: Wall[] = wallsIn.map((w) => ({
    id: wallIds.get(w.id as string)!, projectId: pid, name: str(w.name, 'nom'),
    ...(w.group === true ? { group: true } : {}),
    ...(typeof w.variantId === 'string' && varIds.has(w.variantId) ? { variantId: varIds.get(w.variantId) } : {}),
  }))
  if (p0.room !== undefined) project.room = sanitizeRoom(p0.room, (id) => wallIds.get(id))
  const fallbackWall = walls[0]?.id ?? nanoid(10)
  if (!walls.length) walls.push({ id: fallbackWall, projectId: pid, name: 'Mur 1' })
  let historyError = false
  const variants: Variant[] = variantsIn.map((v) => {
    const maxSeq = options.withoutHistory ? 0 : v.maxSeq as number
    let parentSeq: number | undefined
    if (!options.withoutHistory && v.parentSeq !== undefined) {
      try {
        parentSeq = num(v.parentSeq, 'historique', 0, 1e9)
        if (!Number.isInteger(parentSeq)) fail('historique')
      } catch { historyError = true }
    }
    return {
      id: varIds.get(v.id as string)!,
      projectId: pid,
      wallId: wallIds.get(v.wallId as string) ?? fallbackWall,
      name: str(v.name, 'nom'),
      parentId: !options.withoutHistory && typeof v.parentId === 'string' ? varIds.get(v.parentId) : undefined,
      parentSeq,
      createdAt: num(v.createdAt, 'date', 0, 1e14),
      updatedAt: num(v.updatedAt, 'date', 0, 1e14),
      headSeq: options.withoutHistory ? 0 : v.headSeq as number,
      maxSeq,
      state: sanitizeDoc(v.state),
    }
  })
  let entries: HistoryEntry[] = []
  try {
    entries = options.withoutHistory ? [] : arr(root.entries ?? [], 'historique', 10_000_000)
      .map((ex) => obj(ex, 'historique'))
      .map((e) => ({
        variantId: varIds.get(e.variantId as string) ?? fail('référence historique'),
        seq: num(e.seq, 'historique', 1, 1e9),
        label: str(e.label, 'historique', 300),
        ts: num(e.ts, 'date', 0, 1e14),
        patches: sanitizePatches(e.patches),
        inverse: sanitizePatches(e.inverse),
      }))
  } catch { historyError = true }
  const currentImages = new Set(variants.flatMap((v) => v.state.images.flatMap((im) => im.edit ? [im.blobId, im.edit.sourceBlobId] : [im.blobId])))
  const images: StoredImage[] = []
  const imageIds = new Set<string>()
  for (const ix of arr(root.images ?? [], 'images', 100000)) {
    const raw = ix && typeof ix === 'object' ? ix as Record<string, unknown> : null
    if (options.withoutHistory && (!raw || !currentImages.has(raw.id as string))) continue
    try {
      const i = obj(ix, 'image')
      const id = str(i.id, 'id', 40)
      const dataUrl = str(i.dataUrl, 'image', 60_000_000)
      if (!IMAGE_DATA_URL.test(dataUrl) || imageIds.has(id)) fail('image')
      images.push({ id, dataUrl, width: num(i.width, 'image', 0, 1e6), height: num(i.height, 'image', 0, 1e6) })
      imageIds.add(id)
    } catch (err) {
      if (raw && currentImages.has(raw.id as string)) throw err
      historyError = true
    }
  }
  if (options.withoutHistory) {
    for (const v of variants) v.state.images = v.state.images.filter((im) => imageIds.has(im.blobId)).map((im) => {
      if (!im.edit || imageIds.has(im.edit.sourceBlobId)) return im
      const { edit: _edit, ...visible } = im
      return visible
    })
  }
  try {
    if (historyError) fail('historique')
    for (const v of variants) checkReferences(v.state, imageIds)
    await validateHistory(variants, entries, imageIds)
  } catch {
    throw new InvalidHistoryError()
  }
  await db.transaction('rw', [db.projects, db.walls, db.variants, db.entries, db.images], async () => {
    await db.projects.add(project)
    await db.walls.bulkAdd(walls)
    await db.variants.bulkAdd(variants)
    await db.entries.bulkPut(entries)
    for (const im of images) if (!(await db.images.get(im.id))) await db.images.put(im)
  })
  return { project, variants }
}
