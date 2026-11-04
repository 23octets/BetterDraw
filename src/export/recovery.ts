import { useEditor } from '../store/editor'
import { serializeProject, type ProjectFile } from './project'

/** Snapshot indépendant : l’historique durable ne décrit pas les changements en mémoire. */
export async function recoveryFile(): Promise<ProjectFile> {
  const { variant, doc } = useEditor.getState()
  if (!variant) throw new Error('Aucun dessin en mémoire.')
  const copy = { ...variant, state: doc, headSeq: 0, maxSeq: 0, parentId: undefined, parentSeq: undefined }
  try {
    const file = await serializeProject(variant.projectId)
    const ids = new Set(doc.images.flatMap((im) => im.edit ? [im.blobId, im.edit.sourceBlobId] : [im.blobId]))
    const { db } = await import('../store/db')
    const images = (await db.images.bulkGet([...ids])).filter((im) => !!im)
    file.images = [...new Map([...file.images, ...images].map((im) => [im.id, im])).values()]
    file.variants = file.variants.filter((v) => v.id !== variant.id).concat(copy)
    file.entries = file.entries.filter((e) => e.variantId !== variant.id)
    return file
  } catch {
    // La base peut être inaccessible : sauver au moins le dessin vectoriel en mémoire.
    return {
      format: 'betterdraw-project', version: 1, exportedAt: Date.now(),
      project: { id: variant.projectId, name: 'Dessin de secours (sans images)', createdAt: Date.now(), updatedAt: Date.now() },
      walls: [{ id: variant.wallId, projectId: variant.projectId, name: 'Mur' }],
      variants: [{ ...copy, state: { ...doc, images: [] } }], entries: [], images: [],
    }
  }
}

export async function downloadRecovery() {
  const file = await recoveryFile()
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'betterdraw-secours.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
