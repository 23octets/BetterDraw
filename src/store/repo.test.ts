import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as repo from './repo'
import { useEditor, flushPersistence } from './editor'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('persistance', () => {
  it('creates a project with a default 300×250 wall', async () => {
    const { project, variant } = await repo.createProject('Chambre')
    expect(variant.state.wall).toEqual({ w: 300, h: 250 })
    const list = await repo.listProjects()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(project.id)
    expect(list[0].variants).toHaveLength(1)
  })

  it('records every change and reloads it', async () => {
    const { variant } = await repo.createProject('Salon', { w: 400, h: 260 })
    const ed = useEditor.getState()
    expect(await ed.load(variant.id)).toBe(true)
    useEditor.getState().commit('largeur', (d) => { d.wall.w = 420 })
    useEditor.getState().commit('pas', (d) => { d.grid.step = 25 })
    await flushPersistence()
    const v = await repo.getVariant(variant.id)
    expect(v!.state.wall.w).toBe(420)
    expect(v!.state.grid.step).toBe(25)
    expect(v!.headSeq).toBe(2)
    expect(await repo.listEntries(variant.id)).toHaveLength(2)
  })

  it('undo / redo move through persisted history', async () => {
    const { variant } = await repo.createProject('Salon')
    await useEditor.getState().load(variant.id)
    for (let i = 1; i <= 5; i++) useEditor.getState().commit(`w${i}`, (d) => { d.wall.w = 300 + i })
    await useEditor.getState().undo()
    await useEditor.getState().undo()
    expect(useEditor.getState().doc.wall.w).toBe(303)
    await useEditor.getState().redo()
    expect(useEditor.getState().doc.wall.w).toBe(304)
    await useEditor.getState().goTo(0)
    expect(useEditor.getState().doc.wall.w).toBe(300)
    await useEditor.getState().goTo(5)
    expect(useEditor.getState().doc.wall.w).toBe(305)
    // rechargement depuis la base
    await useEditor.getState().load(variant.id)
    expect(useEditor.getState().doc.wall.w).toBe(305)
    expect(useEditor.getState().maxSeq).toBe(5)
  })

  it('a new change after undo drops the redo branch', async () => {
    const { variant } = await repo.createProject('Salon')
    await useEditor.getState().load(variant.id)
    useEditor.getState().commit('a', (d) => { d.wall.w = 301 })
    useEditor.getState().commit('b', (d) => { d.wall.w = 302 })
    await useEditor.getState().undo()
    useEditor.getState().commit('c', (d) => { d.wall.h = 200 })
    await flushPersistence()
    const entries = await repo.listEntries(variant.id)
    expect(entries.map((e) => e.label)).toEqual(['a', 'c'])
    expect(useEditor.getState().doc.wall).toEqual({ w: 301, h: 200 })
  })

  it('no-op commits are not recorded', async () => {
    const { variant } = await repo.createProject('Salon')
    await useEditor.getState().load(variant.id)
    useEditor.getState().commit('rien', (d) => { d.wall.w = 300 })
    await flushPersistence()
    expect(await repo.listEntries(variant.id)).toHaveLength(0)
  })

  it('deletes a project with its variants and history', async () => {
    const { project, variant } = await repo.createProject('Salon')
    await useEditor.getState().load(variant.id)
    useEditor.getState().commit('a', (d) => { d.wall.w = 301 })
    await flushPersistence()
    await repo.deleteProject(project.id)
    expect(await repo.listProjects()).toHaveLength(0)
    expect(await db.entries.count()).toBe(0)
  })
})
