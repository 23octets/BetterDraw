import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as repo from './repo'
import { useEditor, flushPersistence } from './editor'

beforeEach(async () => {
  await flushPersistence()
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

  it('a new change after undo keeps the abandoned branch in history', async () => {
    const { variant } = await repo.createProject('Salon')
    await useEditor.getState().load(variant.id)
    useEditor.getState().commit('a', (d) => { d.wall.w = 301 })
    useEditor.getState().commit('b', (d) => { d.wall.w = 302 })
    await useEditor.getState().undo()
    useEditor.getState().commit('c', (d) => { d.wall.h = 200 })
    await flushPersistence()
    const entries = await repo.listEntries(variant.id)
    expect(entries.map((e) => e.label)).toEqual(['a', 'b', "Retour à l'état #1", 'c'])
    expect(useEditor.getState().doc.wall).toEqual({ w: 301, h: 200 })
    expect(useEditor.getState().headSeq).toBe(4)
    // on peut toujours revenir à l'état « b »
    await useEditor.getState().goTo(2)
    expect(useEditor.getState().doc.wall).toEqual({ w: 302, h: 250 })
    await useEditor.getState().goTo(4)
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

describe('historique long', () => {
  it('keeps 1500 changes and travels back and forth', async () => {
    const { variant } = await repo.createProject('Long')
    await useEditor.getState().load(variant.id)
    for (let i = 0; i < 1500; i++) {
      useEditor.getState().commit(`pt ${i}`, (d) => {
        d.shapes.push({ id: `s${i}`, pts: [{ x: i % 300, y: 0 }, { x: i % 300, y: 10 }], segs: [{ t: 'line' }], closed: false })
      })
    }
    await flushPersistence()
    expect(await db.entries.where('variantId').equals(variant.id).count()).toBe(1500)
    const t0 = performance.now()
    await useEditor.getState().goTo(0)
    expect(useEditor.getState().doc.shapes).toHaveLength(0)
    await useEditor.getState().goTo(750)
    expect(useEditor.getState().doc.shapes).toHaveLength(750)
    await useEditor.getState().goTo(1500)
    expect(useEditor.getState().doc.shapes).toHaveLength(1500)
    expect(performance.now() - t0).toBeLessThan(5000)
    // l'état persiste après rechargement, position comprise
    await useEditor.getState().goTo(1200)
    await useEditor.getState().load(variant.id)
    expect(useEditor.getState().headSeq).toBe(1200)
    expect(useEditor.getState().maxSeq).toBe(1500)
    expect(useEditor.getState().doc.shapes).toHaveLength(1200)
  }, 30000)
})

describe('snapshots / variantes', () => {
  it('snapshot creates an independent variant with a blank history', async () => {
    const { project, variant } = await repo.createProject('Variantes')
    await useEditor.getState().load(variant.id)
    useEditor.getState().commit('a', (d) => { d.wall.w = 320 })
    useEditor.getState().commit('b', (d) => { d.grid.step = 40 })
    await flushPersistence()
    const nv = await repo.snapshotVariant(variant.id)
    expect(nv.name).toBe('Variante B')
    expect(nv.parentId).toBe(variant.id)
    expect(nv.parentSeq).toBe(2)
    expect(nv.headSeq).toBe(0)
    expect(nv.state.wall.w).toBe(320)
    // modifier la copie ne touche pas l'original
    await useEditor.getState().load(nv.id)
    useEditor.getState().commit('c', (d) => { d.wall.w = 500 })
    await flushPersistence()
    expect((await repo.getVariant(variant.id))!.state.wall.w).toBe(320)
    expect((await repo.getVariant(nv.id))!.state.wall.w).toBe(500)
    expect(await repo.listEntries(nv.id)).toHaveLength(1)
    expect(await repo.listVariants(project.id)).toHaveLength(2)
    await repo.deleteVariant(nv.id)
    expect(await repo.listVariants(project.id)).toHaveLength(1)
  })
})
