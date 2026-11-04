import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { db } from './db'
import * as repo from './repo'
import { flushPersistence, useEditor, hasUnsavedWork } from './editor'
import { rescueProject } from './rescue'

beforeEach(async () => {
  await flushPersistence()
  await db.delete()
  await db.open()
})
afterEach(async () => {
  vi.restoreAllMocks()
  if (hasUnsavedWork()) { useEditor.getState().retry(); await flushPersistence() }
})

it('une annulation en attente ne remplace pas le dessin après un échec de commit', async () => {
  const { variant } = await repo.createProject('Secours')
  await useEditor.getState().load(variant.id)
  vi.spyOn(repo, 'recordChange').mockRejectedValue({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })
  useEditor.getState().commit('Largeur', (d) => { d.wall.w = 456 })
  await useEditor.getState().undo()
  await flushPersistence()
  expect(useEditor.getState().doc.wall.w).toBe(456)
  expect(useEditor.getState().saveError).toContain('Espace de stockage insuffisant')
})

it('un échec de nettoyage ne peut pas annuler la suppression du projet', async () => {
  const { project } = await repo.createProject('À supprimer')
  await db.images.put({ id: 'orpheline', dataUrl: '', width: 1, height: 1 })
  vi.spyOn(db.images, 'bulkGet').mockRejectedValue(new Error('Lecture impossible'))
  await repo.deleteProject(project.id)
  expect(await db.projects.get(project.id)).toBeUndefined()
})

it('construit une sauvegarde de secours en mémoire si la base ne peut plus être lue', async () => {
  const { variant, project } = await repo.createProject('Mémoire')
  const doc = { ...variant.state, wall: { w: 456, h: 250 } }
  vi.spyOn(db.projects, 'get').mockRejectedValue(new Error('Lecture impossible'))
  const result = await rescueProject(variant, doc, project)
  expect(result.data.variants[0].state.wall.w).toBe(456)
  expect(result.data.entries).toEqual([])
  expect(result.warning).toContain('limité')
})

it('réimporte un plan scindé dont le nouveau mur n’a jamais été enregistré', async () => {
  const { createRoomProject } = await import('./rooms')
  const { splitWall } = await import('../room/geometry')
  const { rescueRoom } = await import('./rescue')
  const { importProject } = await import('../export/project')
  const project = await createRoomProject('Pièce scindée')
  const room = splitWall(project.room!, 0, 'mur-non-enregistré')
  const { data, warning } = await rescueRoom(project, room)
  expect(warning).toBe('')
  const restored = await importProject(data)
  expect(restored.project.room!.walls).toHaveLength(5)
  for (const wall of restored.project.room!.walls) {
    expect(restored.variants.some((v) => v.wallId === wall.id)).toBe(true)
  }
})

it('réimporte un plan de secours construit sans aucune lecture de la base', async () => {
  const { createRoomProject } = await import('./rooms')
  const { splitWall } = await import('../room/geometry')
  const { rescueRoom } = await import('./rescue')
  const { importProject } = await import('../export/project')
  const project = await createRoomProject('Plan en mémoire')
  const room = splitWall(project.room!, 0, 'mur-en-mémoire')
  room.groups = [{ id: 'groupe-en-mémoire', walls: [room.walls[0].id, room.walls[1].id] }]
  const read = vi.spyOn(db.projects, 'get').mockRejectedValue(new Error('Base inaccessible'))
  const { data, warning } = await rescueRoom(project, room)
  read.mockRestore()
  expect(warning).toContain('limitée au plan affiché')
  const restored = await importProject(data)
  expect(restored.project.room!.walls).toHaveLength(5)
  expect(restored.project.room!.groups).toHaveLength(1)
  expect(restored.variants).toHaveLength(6)
})

it('conserve les avertissements d’images absentes dans les deux sauvegardes de secours', async () => {
  const { createRoomProject } = await import('./rooms')
  const { rescueRoom } = await import('./rescue')
  const { placeImage } = await import('./images')
  const project = await createRoomProject('Image absente')
  const variant = (await repo.listVariants(project.id))[0]
  const doc = { ...variant.state, images: [
    placeImage({ id: 'image-absente', dataUrl: '', width: 10, height: 10 }, variant.state.wall, 'Référence'),
  ] }
  await db.variants.update(variant.id, { state: doc })
  expect((await rescueProject(variant, doc, project)).warning).toContain('images sont absentes')
  expect((await rescueRoom(project, project.room!)).warning).toContain('images sont absentes')
})

it('le secours conserve le dessin non enregistré d’une variante supprimée dans un autre onglet', async () => {
  const { variant, project } = await repo.createProject('Variante supprimée')
  await repo.snapshotVariant(variant.id, 'Autre variante')
  await useEditor.getState().load(variant.id)
  await repo.deleteVariant(variant.id)
  useEditor.getState().commit('Largeur non enregistrée', (d) => { d.wall.w = 777 })
  await flushPersistence()
  expect(useEditor.getState().saveError).toBeTruthy()
  try {
    const { recoveryFile } = await import('../export/recovery')
    const { importProject } = await import('../export/project')
    const file = await recoveryFile()
    expect(file.variants.find((v) => v.id === variant.id)?.state.wall.w).toBe(777)
    expect(file.variants).toHaveLength(2)
    const restored = await importProject(file)
    expect(restored.variants.some((v) => v.state.wall.w === 777)).toBe(true)
    expect(restored.project.name).toBe(project.name)
  } finally {
    // Rétablir la cible afin que le nettoyage du test puisse rejouer sa file.
    await db.variants.put(variant)
  }
})
