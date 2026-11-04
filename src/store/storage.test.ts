import { beforeEach, expect, it } from 'vitest'
import { db } from './db'
import { cleanOrphanImages } from './storage'
import { createProject, deleteProject } from './repo'
import { serializeProject } from '../export/project'

beforeEach(async () => { await db.delete(); await db.open() })

it('préserve les références historiques scalaires, les sources et les images partagées', async () => {
  const a = await createProject('A')
  const b = await createProject('B')
  await db.images.bulkPut(['historique', 'source', 'partagée', 'orpheline'].map((id) => ({ id, dataUrl: 'data:image/png;base64,AA==', width: 10, height: 10 })))
  await db.entries.put({
    variantId: b.variant.id, seq: 1, label: 'Retouche', ts: 1,
    patches: [{ op: 'replace', path: ['images', 0, 'blobId'], value: 'historique' }],
    inverse: [{ op: 'replace', path: ['images', 0, 'edit'], value: { sourceBlobId: 'source' } }],
  })
  const image = { id: 'ref', blobId: 'partagée', name: 'Image', x: 0, y: 0, w: 10, h: 10, opacity: 1, visible: true, locked: false }
  await db.variants.update(a.variant.id, { state: { ...a.variant.state, images: [image] } })
  await db.variants.update(b.variant.id, { state: { ...b.variant.state, images: [image] } })
  await deleteProject(a.project.id)
  expect((await db.images.toArray()).map((x) => x.id).sort()).toEqual(['historique', 'partagée', 'source'])
  expect((await serializeProject(b.project.id)).images.map((x) => x.id).sort()).toEqual(['historique', 'partagée', 'source'])
  await deleteProject(b.project.id)
  expect(await db.images.count()).toBe(0)
})

it('nettoie aussi les anciennes orphelines sans toucher aux ajouts en attente', async () => {
  await db.images.bulkPut([
    { id: 'ancienne', dataUrl: '', width: 1, height: 1 },
    { id: 'en-cours', dataUrl: '', width: 1, height: 1, addedAt: Date.now() },
  ])
  expect(await cleanOrphanImages()).toBe(1)
  expect(await db.images.get('en-cours')).toBeDefined()
})

it('reconnaît les quotas imbriqués dans les erreurs Dexie', async () => {
  const { storageError } = await import('./storage')
  expect(storageError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toContain('Espace de stockage insuffisant')
  expect(storageError({ name: 'BulkError', failures: [{ name: 'QuotaExceededError' }] })).toContain('Espace de stockage insuffisant')
  expect(storageError(new Error('image illisible'))).not.toContain('Stockage local inaccessible')
})
