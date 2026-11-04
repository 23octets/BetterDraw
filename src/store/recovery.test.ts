import { afterEach, expect, it, vi } from 'vitest'
import { produceWithPatches } from 'immer'
import * as repo from './repo'
import { flushPersistence, useEditor, requireSaved } from './editor'
import { recoveryFile } from '../export/recovery'
import { importProject } from '../export/project'

afterEach(() => vi.restoreAllMocks())

it('garde un échec et rejoue toutes les entrées dans l’ordre, sans trou', async () => {
  const { variant } = await repo.createProject('Secours')
  await useEditor.getState().load(variant.id)
  const spy = vi.spyOn(repo, 'recordChange').mockRejectedValueOnce(new Error('quota'))
  useEditor.getState().commit('largeur', (d) => { d.wall.w = 321 })
  await flushPersistence()
  expect(useEditor.getState().saveError).toBeTruthy()
  useEditor.getState().commit('hauteur', (d) => { d.wall.h = 222 })
  await flushPersistence()
  expect(spy).toHaveBeenCalledTimes(1)
  expect(useEditor.getState().saveError).toBeTruthy()
  expect(await requireSaved()).toBe(false)
  const other = await repo.createProject('Autre')
  expect(await useEditor.getState().load(other.variant.id)).toBe(false)
  expect(useEditor.getState().variant?.id).toBe(variant.id)
  const file = await recoveryFile()
  const imported = await importProject(file)
  expect(imported.variants[0].state.wall).toEqual({ w: 321, h: 222 })
  useEditor.getState().retry()
  await flushPersistence()
  expect(useEditor.getState().saveError).toBeNull()
  expect((await repo.listEntries(variant.id)).map((e) => e.seq)).toEqual([1, 2])
  await useEditor.getState().goTo(0)
  expect(useEditor.getState().doc.wall).toEqual({ w: 300, h: 250 })
  await useEditor.getState().goTo(2)
  expect(useEditor.getState().doc.wall).toEqual({ w: 321, h: 222 })
})

it('refuse atomiquement deux écritures concurrentes et un déplacement périmé', async () => {
  const { variant } = await repo.createProject('Deux onglets')
  const [a, ap, ai] = produceWithPatches(variant.state, (d) => { d.wall.w = 333 })
  const [b, bp, bi] = produceWithPatches(variant.state, (d) => { d.wall.h = 111 })
  const results = await Promise.allSettled([
    repo.recordChange(variant.id, 'a', a, ap, ai, variant),
    repo.recordChange(variant.id, 'b', b, bp, bi, variant),
  ])
  expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
  expect(await repo.listEntries(variant.id)).toHaveLength(1)
  await expect(repo.moveHead(variant.id, 0, variant)).rejects.toBeInstanceOf(repo.ConflictError)
})

it('conserve la dernière cible et les éditions reçues pendant un déplacement', async () => {
  const { variant } = await repo.createProject('Frise')
  await useEditor.getState().load(variant.id)
  for (let i = 1; i <= 4; i++) useEditor.getState().commit('largeur', (d) => { d.wall.w = 300 + i })
  await flushPersistence()
  await Promise.all([useEditor.getState().goTo(3), useEditor.getState().goTo(2), useEditor.getState().goTo(1)])
  expect(useEditor.getState().headSeq).toBe(1)
  const moving = useEditor.getState().goTo(0)
  useEditor.getState().commit('hauteur pendant déplacement', (d) => { d.wall.h = 200 })
  await moving
  await flushPersistence()
  expect(useEditor.getState().doc.wall).toEqual({ w: 300, h: 200 })
  expect((await repo.getVariant(variant.id))!.state.wall.h).toBe(200)
})
