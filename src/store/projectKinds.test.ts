import { beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { db, FrsqueDB } from './db'
import { flushPersistence } from './editor'
import * as repo from './repo'
import * as rooms from './rooms'
import { importProject, serializeProject } from '../export/project'
import { defaultDoc } from '../model/defaults'
import { notchCorner, notchTargetFor, rectRoom, wallNotchCorner } from '../room/geometry'

beforeEach(async () => {
  await flushPersistence()
  await db.delete()
  await db.open()
})

describe('pièce 3D, mur 2D, ou les deux', () => {
  it('le type du projet suit sa pièce et ses murs 2D', async () => {
    const { project } = await repo.createProject('Mur')
    const room = await rooms.createRoomProject('Pièce')
    const both = await rooms.createRoomProject('Les deux', undefined, 'rect', { w: 200, h: 180 })
    const kinds = Object.fromEntries((await repo.listProjects()).map((p) => [p.id, p.kind]))
    expect(kinds).toEqual({ [project.id]: 'wall', [room.id]: 'room', [both.id]: 'both' })
    const flat = repo.standaloneWalls(await repo.listWalls(both.id))
    expect(flat).toHaveLength(1)
    const v = (await repo.listVariants(both.id)).find((x) => x.wallId === flat[0].id)!
    expect(v.state.wall).toEqual({ w: 200, h: 180 })
    // le mur 2D ne fait pas partie du plan
    expect((await rooms.loadRoomWalls(both)).map((w) => w.wall.id)).not.toContain(flat[0].id)
    expect(await rooms.roomContext(v)).toBeNull()
  })

  it('ajouter un mur 2D à une pièce', async () => {
    const p = await rooms.createRoomProject('Pièce')
    const v = await rooms.addStandaloneWall(p.id)
    expect(v.state.wall.h).toBe(p.room!.height)
    expect(repo.projectKind(p, await repo.listWalls(p.id))).toBe('both')
  })

  it('migration : les murs des anciens projets sans pièce deviennent des murs 2D', async () => {
    const name = 'migration-test'
    await Dexie.delete(name)
    const v1 = new Dexie(name)
    v1.version(1).stores({ projects: 'id, updatedAt', walls: 'id, projectId', variants: 'id, projectId, wallId, updatedAt', entries: '[variantId+seq], variantId', images: 'id' })
    await v1.open()
    await v1.table('projects').bulkAdd([{ id: 'a', name: 'Mur', createdAt: 1, updatedAt: 1 }, { id: 'b', name: 'Pièce', createdAt: 1, updatedAt: 1, room: rectRoom(300, 300, ['r1', 'r2', 'r3', 'r4']) }])
    await v1.table('walls').bulkAdd([{ id: 'w', projectId: 'a', name: 'Mur 1' }, { id: 'r1', projectId: 'b', name: 'Mur 1' }, { id: 'old', projectId: 'b', name: 'Mur retiré' }])
    const doc = defaultDoc()
    doc.shapes = [{ id: 'saved-line', pts: [{ x: 10, y: 20 }, { x: 50, y: 60 }], segs: [{ t: 'line' }], closed: false }]
    const variant = { id: 'v', projectId: 'a', wallId: 'w', name: 'Variante sauvegardée', createdAt: 1, updatedAt: 2, headSeq: 1, maxSeq: 1, state: doc }
    const entry = { variantId: 'v', seq: 1, patches: [], inversePatches: [], label: 'Tracé', timestamp: 2 }
    await v1.table('variants').add(variant)
    await v1.table('entries').add(entry)
    v1.close()
    const v2 = new FrsqueDB(name)
    await v2.open()
    expect((await v2.walls.get('w'))!.standalone).toBe(true)
    expect((await v2.walls.get('r1'))!.standalone).toBeUndefined()
    expect((await v2.walls.get('old'))!.standalone).toBeUndefined()
    // La migration classe les murs ; le dessin et son historique doivent rester intacts.
    expect(await v2.variants.get('v')).toEqual(variant)
    expect(await v2.entries.get(['v', 1])).toEqual(entry)
    v2.close()
    await Dexie.delete(name)
  })

  it('import : une ancienne sauvegarde de mur seul donne un mur 2D, le drapeau est conservé', async () => {
    const { project } = await repo.createProject('Mur')
    const data = await serializeProject(project.id)
    const old = structuredClone(data)
    for (const w of old.walls) delete w.standalone
    const a = await importProject(old)
    expect(repo.standaloneWalls(await repo.listWalls(a.project.id))).toHaveLength(1)
    const both = await rooms.createRoomProject('Les deux', undefined, 'rect', { w: 200, h: 180 })
    const b = await importProject(await serializeProject(both.id))
    expect(repo.projectKind(b.project, await repo.listWalls(b.project.id))).toBe('both')
  })
})

describe('import de fresques', () => {
  it('une fresque d’un autre projet est copiée en nouvelle variante, posée au sol', async () => {
    const doc = defaultDoc()
    doc.wall = { w: 300, h: 200 }
    doc.shapes = [{ id: 's', pts: [{ x: 10, y: 150 }, { x: 50, y: 190 }], segs: [{ t: 'line' }], closed: false }]
    doc.fills = [{ id: 'f', seed: { x: 20, y: 180 }, colorId: doc.palette[0].id }]
    doc.printCells = ['A1']
    const { variant: src } = await repo.createProject('Source', undefined, doc)
    const room = await rooms.createRoomProject('Pièce')
    const target = room.room!.walls[1].id
    const sources = await rooms.listFrescoSources()
    expect(sources.some((s) => s.variants.some((v) => v.id === src.id))).toBe(true)
    const v = await rooms.copyFresco(src.id, { projectId: room.id, wallId: target, size: { w: 400, h: 250 } })
    expect(v.wallId).toBe(target)
    expect(v.state.wall).toEqual({ w: 400, h: 250 })
    expect(v.state.shapes[0].pts[0]).toEqual({ x: 10, y: 200 })
    expect(v.state.fills[0].seed).toEqual({ x: 20, y: 230 })
    expect(v.state.printCells).toEqual([])
    // affichée en 3D, l'original intact
    const infos = await rooms.loadRoomWalls((await repo.getProject(room.id))!)
    expect(infos[1].display!.id).toBe(v.id)
    expect(infos[1].variants).toHaveLength(2)
    expect((await repo.getVariant(src.id))!.state).toEqual(doc)
  })

  it('sans taille imposée (mur 2D), la fresque garde ses dimensions', async () => {
    const { variant: src } = await repo.createProject('Source', { w: 320, h: 210 })
    const { project, variant } = await repo.createProject('Cible')
    const v = await rooms.copyFresco(src.id, { projectId: project.id, wallId: variant.wallId })
    expect(v.state.wall).toEqual({ w: 320, h: 210 })
  })
})

describe('décroché en L sur le mur sélectionné', () => {
  const r = rectRoom(400, 300, ['a', 'b', 'c', 'd'])
  it('vise le coin de droite du mur choisi, sinon son coin de gauche', () => {
    expect(wallNotchCorner(r, 0)).toBe(1)
    expect(wallNotchCorner(r, 3)).toBe(0)
    expect(notchTargetFor(r, { kind: 'wall', i: 2 })).toBe(3)
    expect(notchTargetFor(r, { kind: 'opening', i: 1 })).toBe(2)
    const l = notchCorner(r, 2, ['e', 'f'])
    // le mur 2 de la pièce en L finit sur l'angle rentrant : le décroché passe à son coin de gauche
    const reentrant = notchTargetFor(l, { kind: 'corner', j: 3 })
    expect(reentrant).toBe(-1)
    expect(wallNotchCorner(l, 2)).toBe(2)
  })
  it('un mur sélectionné ne décroche jamais un autre angle de la pièce', () => {
    for (let i = 0; i < 4; i++) {
      const j = notchTargetFor(r, { kind: 'wall', i })
      expect([i, (i + 1) % 4]).toContain(j)
    }
  })
})
