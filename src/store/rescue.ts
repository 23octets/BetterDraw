import { serializeProject, type ProjectFile } from '../export/project'
import type { DocState, Project, StoredImage, Variant } from '../model/types'
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
    return { data, warning: '' }
  } catch {
    const refs = imageReferences(current.state.images)
    const images = cachedImages().filter((im) => refs.has(im.id))
    const stamp = Date.now()
    const data: ProjectFile = {
      format: 'betterdraw-project', version: 1, exportedAt: stamp,
      project: { id: variant.projectId, name: project?.name ?? 'Projet de secours', createdAt: project?.createdAt ?? stamp, updatedAt: stamp },
      walls: [{ id: variant.wallId, projectId: variant.projectId, name: 'Mur de secours' }],
      variants: [current], entries: [], images,
    }
    return { data, warning: 'Sauvegarde de secours limitée au dessin affiché et aux images disponibles en mémoire. Les autres variantes, l’historique et certaines images peuvent manquer. Conservez aussi vos sauvegardes précédentes.' }
  }
}
