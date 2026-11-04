import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { db } from './db'
import * as repo from './repo'
import { flushPersistence, useEditor } from './editor'
import { rescueProject } from './rescue'

beforeEach(async () => {
  await flushPersistence()
  await db.delete()
  await db.open()
})
afterEach(() => vi.restoreAllMocks())

it('une annulation en attente ne remplace pas le dessin après un échec de commit', async () => {
  const { variant } = await repo.createProject('Secours')
  await useEditor.getState().load(variant.id)
  vi.spyOn(repo, 'recordChange').mockRejectedValue({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })
  useEditor.getState().commit('Largeur', (d) => { d.wall.w = 456 })
  await useEditor.getState().undo()
  await flushPersistence()
  expect(useEditor.getState().doc.wall.w).toBe(456)
  expect(useEditor.getState().persistenceError).toContain('Espace de stockage insuffisant')
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
