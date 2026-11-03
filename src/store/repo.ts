import { nanoid } from 'nanoid'
import { applyPatches, enablePatches, type Patch } from 'immer'
import { db } from './db'
import { defaultDoc } from '../model/defaults'
import type { DocState, HistoryEntry, Project, Variant } from '../model/types'

enablePatches()

const now = () => Date.now()

export async function listProjects(): Promise<(Project & { variants: Variant[] })[]> {
  const projects = await db.projects.orderBy('updatedAt').reverse().toArray()
  const out = []
  for (const p of projects) {
    const variants = await db.variants.where('projectId').equals(p.id).sortBy('createdAt')
    out.push({ ...p, variants })
  }
  return out
}

export async function createProject(name: string, wall?: { w: number; h: number }) {
  const t = now()
  const project: Project = { id: nanoid(10), name, createdAt: t, updatedAt: t }
  const wallId = nanoid(10)
  const state = defaultDoc()
  if (wall) state.wall = { ...wall }
  const variant: Variant = {
    id: nanoid(10), projectId: project.id, wallId, name: 'Variante A',
    createdAt: t, updatedAt: t, headSeq: 0, maxSeq: 0, state,
  }
  await db.transaction('rw', db.projects, db.walls, db.variants, async () => {
    await db.projects.add(project)
    await db.walls.add({ id: wallId, projectId: project.id, name: 'Mur 1' })
    await db.variants.add(variant)
  })
  return { project, variant }
}

export async function renameProject(id: string, name: string) {
  await db.projects.update(id, { name, updatedAt: now() })
}

export async function deleteProject(id: string) {
  await db.transaction('rw', [db.projects, db.walls, db.variants, db.entries], async () => {
    const variants = await db.variants.where('projectId').equals(id).toArray()
    for (const v of variants) await db.entries.where('variantId').equals(v.id).delete()
    await db.variants.where('projectId').equals(id).delete()
    await db.walls.where('projectId').equals(id).delete()
    await db.projects.delete(id)
  })
}

export async function listVariants(projectId: string) {
  return db.variants.where('projectId').equals(projectId).sortBy('createdAt')
}

export async function getVariant(id: string) {
  return db.variants.get(id)
}

export async function getProject(id: string) {
  return db.projects.get(id)
}

/**
 * Enregistre une modification : nouvelle entrée d'historique + état courant.
 * Si on avait remonté le temps, rien n'est perdu : une entrée « Retour à l'état #k »
 * est d'abord ajoutée (elle annule la suite), puis la nouvelle modification.
 */
export async function recordChange(variantId: string, label: string, state: DocState, patches: Patch[], inverse: Patch[]) {
  return db.transaction('rw', db.variants, db.entries, db.projects, async () => {
    const v = await db.variants.get(variantId)
    if (!v) throw new Error('variante introuvable')
    const ts = now()
    let seq = v.maxSeq + 1
    if (v.maxSeq > v.headSeq) {
      const future = await db.entries.where('[variantId+seq]').between([variantId, v.headSeq + 1], [variantId, v.maxSeq], true, true).toArray()
      future.sort((a, b) => a.seq - b.seq)
      const back = [...future].reverse().flatMap((e) => e.inverse)
      const fwd = future.flatMap((e) => e.patches)
      await db.entries.put({ variantId, seq, label: `Retour à l'état #${v.headSeq}`, ts, patches: back, inverse: fwd })
      seq++
    }
    const entry: HistoryEntry = { variantId, seq, label, ts, patches, inverse }
    await db.entries.put(entry)
    await db.variants.update(variantId, { state, headSeq: seq, maxSeq: seq, updatedAt: ts })
    await db.projects.update(v.projectId, { updatedAt: ts })
    return seq
  })
}

export async function listEntries(variantId: string) {
  return db.entries.where('variantId').equals(variantId).sortBy('seq')
}

/**
 * Déplace la tête d'historique vers `target` en appliquant les patches inverses (retour)
 * ou directs (avance). Renvoie le nouvel état.
 */
export async function moveHead(variantId: string, target: number): Promise<Variant> {
  return db.transaction('rw', db.variants, db.entries, async () => {
    const v = await db.variants.get(variantId)
    if (!v) throw new Error('variante introuvable')
    target = Math.max(0, Math.min(v.maxSeq, target))
    let state = v.state
    if (target < v.headSeq) {
      const es = await db.entries.where('[variantId+seq]').between([variantId, target + 1], [variantId, v.headSeq], true, true).toArray()
      es.sort((a, b) => b.seq - a.seq)
      for (const e of es) state = applyPatches(state, e.inverse as Patch[])
    } else if (target > v.headSeq) {
      const es = await db.entries.where('[variantId+seq]').between([variantId, v.headSeq + 1], [variantId, target], true, true).toArray()
      es.sort((a, b) => a.seq - b.seq)
      for (const e of es) state = applyPatches(state, e.patches as Patch[])
    }
    await db.variants.update(variantId, { state, headSeq: target })
    return { ...v, state, headSeq: target }
  })
}

/** Snapshot : crée une variante indépendante (historique vierge) à partir de l'état courant. */
export async function snapshotVariant(variantId: string, name?: string) {
  const v = await db.variants.get(variantId)
  if (!v) throw new Error('variante introuvable')
  const count = await db.variants.where('projectId').equals(v.projectId).count()
  const t = now()
  const nv: Variant = {
    id: nanoid(10), projectId: v.projectId, wallId: v.wallId,
    name: name ?? `Variante ${String.fromCharCode(65 + (count % 26))}${count >= 26 ? Math.floor(count / 26) : ''}`,
    parentId: v.id, parentSeq: v.headSeq,
    createdAt: t, updatedAt: t, headSeq: 0, maxSeq: 0,
    state: structuredClone(v.state),
  }
  await db.variants.add(nv)
  return nv
}

export async function renameVariant(id: string, name: string) {
  await db.variants.update(id, { name })
}

export async function deleteVariant(id: string) {
  await db.transaction('rw', db.variants, db.entries, async () => {
    await db.entries.where('variantId').equals(id).delete()
    await db.variants.delete(id)
  })
}
