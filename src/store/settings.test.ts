import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import * as repo from './repo'
import { flushPersistence, useEditor } from './editor'
import type { Shape } from '../model/types'

const line: Shape = { id: 'a', pts: [{ x: 10, y: 10 }, { x: 100, y: 100 }], segs: [{ t: 'line' }], closed: false }

let variantId = ''
beforeEach(async () => {
  await flushPersistence()
  await db.delete()
  await db.open()
  const { variant } = await repo.createProject('Réglages', { w: 300, h: 200 })
  variantId = variant.id
  await useEditor.getState().load(variant.id)
})

describe('réglages hors historique', () => {
  it('masquer la grille et changer son style ne créent pas d’entrée d’historique, mais sont enregistrés', async () => {
    const st = useEditor.getState()
    st.setSettings((d) => { d.grid.show = false })
    st.setSettings((d) => { d.grid.lineStyle = 'dotted'; d.grid.snapStep = 2 })
    await flushPersistence()
    expect(useEditor.getState().headSeq).toBe(0)
    expect(useEditor.getState().maxSeq).toBe(0)
    expect(await repo.listEntries(variantId)).toHaveLength(0)
    const v = (await repo.getVariant(variantId))!
    expect(v.state.grid).toMatchObject({ show: false, lineStyle: 'dotted', snapStep: 2 })
    expect(v.headSeq).toBe(0)
  })

  it('annuler un trait ne réaffiche pas la grille masquée après lui', async () => {
    const st = useEditor.getState()
    st.commit('ligne', (d) => { d.shapes.push(line) })
    st.setSettings((d) => { d.grid.show = false })
    await flushPersistence()
    await useEditor.getState().undo()
    let s = useEditor.getState()
    expect(s.headSeq).toBe(0)
    expect(s.doc.shapes).toHaveLength(0)
    expect(s.doc.grid.show).toBe(false)
    await s.redo()
    s = useEditor.getState()
    expect(s.doc.shapes).toHaveLength(1)
    expect(s.doc.grid.show).toBe(false)
    // un dessin modifié ensuite garde le réglage
    s.commit('ligne 2', (d) => { d.shapes.push({ ...line, id: 'b', pts: [{ x: 20, y: 20 }, { x: 50, y: 50 }] }) })
    await flushPersistence()
    expect((await repo.getVariant(variantId))!.state.grid.show).toBe(false)
    expect(useEditor.getState().headSeq).toBe(2)
  })
})
