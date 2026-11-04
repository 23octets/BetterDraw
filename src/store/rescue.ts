import { newVariant } from './rooms'
import { groupLayout, wallLength } from '../room/geometry'
import { serializeProject, type ProjectFile } from '../export/project'
import type { DocState, Project, RoomPlan, StoredImage, Variant } from '../model/types'
import { db } from './db'
import { cachedImages } from './images'
import { imageReferences } from './storage'

export async function rescueProject(variant: Variant, doc: DocState, project: Project | null) {
  const current = { ...variant, state: structuredClone(doc), headSeq: 0, maxSeq: 0 }
  try {
    const data = await serializeProject(variant.projectId)
    data.variants = data.variants.map((v) => v.id === variant.id ? current : v)
    data.entries = data.entries.filter((e) => e.variantId !== variant.id)
    const refs = imageReferences(data.variants, data.entries)
    const keys = (await db.images.toCollection().primaryKeys()).filter((id) => refs.has(id))
    data.images = (await db.images.bulkGet(keys)).filter((im): im is StoredImage => !!im)
    return { data, warning: data.warnings?.join('\n') ?? '' }
  } catch {
    const refs = imageReferences(current.state.images)
    const images = cachedImages().filter((im) => refs.has(im.id))
    const stamp = Date.now()
    const data: ProjectFile = {
      format: 'frsque-project', version: 1, exportedAt: stamp,
      project: { id: variant.projectId, name: project?.name ?? 'Projet de secours', createdAt: project?.createdAt ?? stamp, updatedAt: stamp },
      walls: [{ id: variant.wallId, projectId: variant.projectId, name: 'Mur de secours' }],
      variants: [current], entries: [], images,
    }
    return { data, warning: 'Sauvegarde de secours limitée au dessin affiché et aux images disponibles en mémoire. Les autres variantes, l’historique et certaines images peuvent manquer. Conservez aussi vos sauvegardes précédentes.' }
  }
}


/** Reconstruit les murs pas encore persistés sans inventer de peinture. */
export async function rescueRoom(project: Project, room: RoomPlan) {
  let data: ProjectFile
  let warning = ''
  try {
    data = await serializeProject(project.id)
  } catch {
    data = {
      format: 'frsque-project', version: 1, exportedAt: Date.now(),
      project: structuredClone(project), walls: [], variants: [], entries: [], images: [],
    }
    warning = 'Sauvegarde limitée au plan affiché. Les dessins des murs, les images et l’historique ne sont pas disponibles ; conservez aussi vos sauvegardes précédentes.'
  }
  warning = [warning, ...(data.warnings ?? [])].filter(Boolean).join('\n')
  data.project.room = structuredClone(room)
  const sizes = [
    ...room.walls.map((wall, i) => ({ id: wall.id, w: wallLength(room, i), name: `Mur ${i + 1}` })),
    ...(room.groups ?? []).map((group) => ({ id: group.id, w: groupLayout(room, group.walls).width, name: 'Murs liés' })),
  ]
  const base = data.variants[0]?.state
  for (const size of sizes) {
    let wall = data.walls.find((w) => w.id === size.id)
    if (!wall) {
      wall = { id: size.id, projectId: project.id, name: size.name, ...(room.groups?.some((g) => g.id === size.id) ? { group: true } : {}) }
      data.walls.push(wall)
    }
    if (!data.variants.some((v) => v.wallId === size.id)) {
      const variant = newVariant(project.id, size.id, size.w, room.height, base)
      data.variants.push(variant)
      wall.variantId = variant.id
    }
  }
  return { data, warning }
}
