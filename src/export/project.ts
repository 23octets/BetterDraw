import { nanoid } from 'nanoid'
import { db } from '../store/db'
import type { HistoryEntry, Project, StoredImage, Variant, Wall } from '../model/types'

export interface ProjectFile {
  format: 'betterdraw-project'
  version: 1
  exportedAt: number
  project: Project
  walls: Wall[]
  variants: Variant[]
  entries: HistoryEntry[]
  images: StoredImage[]
}

/** Exporte un projet complet : variantes, historique et images. */
export async function serializeProject(projectId: string): Promise<ProjectFile> {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('projet introuvable')
  const walls = await db.walls.where('projectId').equals(projectId).toArray()
  const variants = await db.variants.where('projectId').equals(projectId).toArray()
  const entries: HistoryEntry[] = []
  for (const v of variants) entries.push(...(await db.entries.where('variantId').equals(v.id).toArray()))
  const blobIds = new Set(variants.flatMap((v) => v.state.images.map((i) => i.blobId)))
  const images = (await db.images.bulkGet([...blobIds])).filter((x): x is StoredImage => !!x)
  return { format: 'betterdraw-project', version: 1, exportedAt: Date.now(), project, walls, variants, entries, images }
}

/** Importe un fichier projet comme nouveau projet (nouveaux identifiants, rien n'est écrasé). */
export async function importProject(data: unknown): Promise<{ project: Project; variants: Variant[] }> {
  const f = data as ProjectFile
  if (!f || f.format !== 'betterdraw-project' || !f.project || !Array.isArray(f.variants)) throw new Error('Ce fichier n’est pas un projet BetterDraw')
  const pid = nanoid(10)
  const wallIds = new Map(f.walls.map((w) => [w.id, nanoid(10)]))
  const varIds = new Map(f.variants.map((v) => [v.id, nanoid(10)]))
  const project: Project = { ...f.project, id: pid, updatedAt: Date.now() }
  const walls = f.walls.map((w) => ({ ...w, id: wallIds.get(w.id)!, projectId: pid }))
  const variants = f.variants.map((v) => ({
    ...v,
    id: varIds.get(v.id)!,
    projectId: pid,
    wallId: wallIds.get(v.wallId) ?? v.wallId,
    parentId: v.parentId ? varIds.get(v.parentId) : undefined,
  }))
  const entries = f.entries.filter((e) => varIds.has(e.variantId)).map((e) => ({ ...e, variantId: varIds.get(e.variantId)! }))
  await db.transaction('rw', [db.projects, db.walls, db.variants, db.entries, db.images], async () => {
    await db.projects.add(project)
    await db.walls.bulkAdd(walls)
    await db.variants.bulkAdd(variants)
    await db.entries.bulkPut(entries)
    for (const im of f.images ?? []) if (!(await db.images.get(im.id))) await db.images.put(im)
  })
  return { project, variants }
}
