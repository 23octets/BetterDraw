import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../store/db'
import { flushPersistence } from '../store/editor'
import * as repo from '../store/repo'
import * as rooms from '../store/rooms'
import { importProject, serializeProject } from '../export/project'
import type { RoomPlan } from '../model/types'
import {
  newOpening, normalizeOrientation, openingIssues, openingRect, outerPts, rectRoom, removeCorner,
  selfIntersects, setWallLength, signedArea, splitWall, wallLength, wallSeg, notchCorner, lRoom, openingAt,
  isConvexCorner, defaultNotchCorner, moveCorner, toggleGlazedBase, windowBars, clampOpening, groupLayout, cleanGroups,
} from './geometry'
import { buildWall } from './scene3d'
import { mergeDocs, seamLineIds } from './merge'
import { defaultDoc } from '../model/defaults'

const room = (): RoomPlan => rectRoom(400, 300, ['a', 'b', 'c', 'd'])

describe('géométrie de la pièce', () => {
  it('un rectangle est dans le sens horaire, intérieur à droite de chaque mur', () => {
    const r = room()
    expect(signedArea(r.pts)).toBeGreaterThan(0)
    // mur du haut (a) : l'intérieur est vers le bas de l'écran
    expect(wallSeg(r, 0).n).toEqual({ x: -0, y: 1 })
    // mur de gauche (d, de (0,300) à (0,0)) : l'intérieur est vers la droite
    expect(wallSeg(r, 3).n.x).toBeCloseTo(1)
    expect([0, 1, 2, 3].map((i) => wallLength(r, i))).toEqual([400, 300, 400, 300])
  })

  it('les coins extérieurs sont décalés de l’épaisseur (onglets)', () => {
    const r = room()
    const o = outerPts(r)
    expect(o[0].x).toBeCloseTo(-15)
    expect(o[0].y).toBeCloseTo(-15)
    expect(o[2].x).toBeCloseTo(415)
    expect(o[2].y).toBeCloseTo(315)
  })

  it('un polygone dessiné dans le sens inverse est retourné, murs et ouvertures suivent', () => {
    const r = room()
    r.walls[0].openings = [{ id: 'w', kind: 'window', x: 50, w: 100, h: 100, sill: 90 }]
    const rev: RoomPlan = normalizeOrientation({ ...r, pts: [...r.pts].reverse(), walls: [r.walls[2], r.walls[1], r.walls[0], r.walls[3]].map((w) => ({ ...w })) })
    // le retournement d'un polygone déjà horaire ne change rien
    expect(normalizeOrientation(r)).toBe(r)
    expect(signedArea(rev.pts)).toBeGreaterThan(0)
    // le mur « a » existe toujours et son ouverture est vue en miroir (gauche ↔ droite)
    const i = rev.walls.findIndex((w) => w.id === 'a')
    expect(i).toBeGreaterThanOrEqual(0)
  })

  it('changer la longueur d’un mur garde la pièce rectangulaire', () => {
    const r = setWallLength(room(), 0, 450)!
    expect(r.pts[1]).toEqual({ x: 450, y: 0 })
    expect(r.pts[2]).toEqual({ x: 450, y: 300 })
    expect(wallLength(r, 2)).toBe(450)
    expect(wallLength(r, 1)).toBe(300)
  })

  it('allonger un mur à gauche, à droite ou des deux côtés ; les ouvertures restent en place', () => {
    const r0 = room()
    r0.walls[0].openings = [{ id: 'f', kind: 'window', x: 100, w: 100, h: 100, sill: 90 }]
    r0.walls[2].openings = [{ id: 'p', kind: 'door', x: 50, w: 80, h: 200, sill: 0 }]
    const left = setWallLength(r0, 0, 450, 'left')!
    expect(left.pts).toEqual([{ x: -50, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: -50, y: 300 }])
    // la fenêtre du mur allongé ne bouge pas dans la pièce : 50 cm de plus depuis le nouveau coin gauche
    expect(left.walls[0].openings[0].x).toBe(150)
    // le mur d'en face s'allonge par son extrémité : sa porte reste à la même distance de son départ
    expect(left.walls[2].openings[0].x).toBe(50)
    const right = setWallLength(r0, 0, 450, 'right')!
    expect(right.walls[2].openings[0].x).toBe(100)
    const both = setWallLength(r0, 0, 440, 'both')!
    expect(both.pts[0]).toEqual({ x: -20, y: 0 })
    expect(both.pts[1]).toEqual({ x: 420, y: 0 })
  })

  it('un mur verrouillé garde sa longueur : le changement passe par un autre mur, ou est refusé', () => {
    // L : murs 0 (haut, 400) et 4 (bas, 200) / 2 (décroché, 200) parallèles
    const l = notchCorner(room(), 2, ['x', 'y'])
    l.walls[4].locked = true
    const r = setWallLength(l, 0, 450, 'right')!
    // le mur 4 est verrouillé : c'est le mur 2 (décroché) qui absorbe, le mur 4 est translaté
    expect([wallLength(r, 2), wallLength(r, 4)]).toEqual([250, 200])
    // tout verrouillé sauf le mur modifié : refus
    const all = { ...l, walls: l.walls.map((w, i) => ({ ...w, locked: i !== 0 })) }
    expect(setWallLength(all, 0, 450)).toBeNull()
    // déplacer un angle d'un mur verrouillé le translate en entier
    const lk = room()
    lk.walls[0].locked = true
    const m = moveCorner(lk, 1, { x: 400, y: -30 })
    expect(m.pts[0]).toEqual({ x: 0, y: -30 })
    expect(wallLength(m, 0)).toBe(400)
  })

  it('fenêtre : carreaux et soubassement vitré', () => {
    const o = { id: 'w', kind: 'window' as const, x: 0, w: 120, h: 125, sill: 95 }
    const g = toggleGlazedBase(o, true)
    expect(g).toMatchObject({ sill: 0, h: 220, base: 95 })
    expect(toggleGlazedBase(g, false)).toMatchObject({ sill: 95, h: 125, base: 0 })
    const bars = windowBars(clampOpening({ ...g, cols: 3, rows: 2 }, 400, 250), 250)
    // 2 montants, 1 petit bois horizontal, 1 traverse de soubassement
    expect(bars).toHaveLength(4)
    expect(bars[3]).toEqual([0, 155, 120, 155])
  })

  it('ajouter puis retirer un angle', () => {
    const r0 = room()
    r0.walls[0].openings = [
      { id: 'l', kind: 'window', x: 40, w: 100, h: 100, sill: 90 },
      { id: 'r', kind: 'door', x: 300, w: 80, h: 200, sill: 0 },
    ]
    const r = splitWall(r0, 0, 'e')
    expect(r.pts).toHaveLength(5)
    expect(r.pts[1]).toEqual({ x: 200, y: 0 })
    expect(r.walls.map((w) => w.id)).toEqual(['a', 'e', 'b', 'c', 'd'])
    expect(r.walls[0].openings.map((o) => o.id)).toEqual(['l'])
    // la porte passe sur la moitié droite, recalée depuis le nouvel angle
    expect(r.walls[1].openings[0]).toMatchObject({ id: 'r', x: 100 })
    const back = removeCorner(r, 1)
    expect(back.pts).toEqual(r0.pts)
    expect(back.walls[0].openings.map((o) => [o.id, o.x])).toEqual([['l', 40], ['r', 300]])
  })

  it('un décroché transforme un rectangle en L', () => {
    const r = room()
    r.walls[1].openings = [{ id: 'haut', kind: 'window', x: 20, w: 80, h: 100, sill: 90 }, { id: 'bas', kind: 'window', x: 200, w: 80, h: 100, sill: 90 }]
    expect(defaultNotchCorner(r)).toBe(2)
    const l = notchCorner(r, 2, ['x', 'y'])
    expect(l.pts).toEqual([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 300 }, { x: 0, y: 300 }])
    expect(l.walls.map((w) => w.id)).toEqual(['a', 'b', 'x', 'y', 'c', 'd'])
    expect(signedArea(l.pts)).toBe(400 * 300 - 200 * 150)
    // la fenêtre du bas tombait dans la partie entaillée : seule celle du haut reste
    expect(l.walls[1].openings.map((o) => o.id)).toEqual(['haut'])
    expect(isConvexCorner(l, 3)).toBe(false)
    expect(selfIntersects(l.pts)).toBe(false)
    expect(lRoom(500, 400, ['1', '2', '3', '4', '5', '6']).pts[3]).toEqual({ x: 250, y: 200 })
  })

  it('une ouverture posée au clic est centrée sur le point visé', () => {
    expect(openingAt('door', 100, 400, 250)).toMatchObject({ x: 60, w: 83, sill: 0 })
    // près du bord, elle reste dans le mur
    expect(openingAt('window', 390, 400, 250).x).toBe(280)
  })

  it('une nouvelle ouverture se place dans le plus grand espace libre', () => {
    const o1 = newOpening('window', 400, 250, [])
    expect(o1.x).toBe(140)
    expect(o1.sill).toBe(95)
    const o2 = newOpening('door', 400, 250, [{ ...o1, x: 0 }])
    expect(o2.x).toBeGreaterThan(120)
    expect(o2.sill).toBe(0)
    expect(openingRect(o1, 250)).toEqual({ x: 140, y: 30, w: 120, h: 125 })
  })

  it('signale les ouvertures qui se chevauchent et les murs croisés', () => {
    const r = room()
    r.walls[0].openings = [
      { id: '1', kind: 'window', x: 0, w: 100, h: 100, sill: 90 },
      { id: '2', kind: 'window', x: 50, w: 100, h: 100, sill: 90 },
    ]
    expect(openingIssues(r, 0)).toContain('Deux ouvertures se chevauchent')
    expect(selfIntersects(r.pts)).toBe(false)
    expect(selfIntersects([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toBe(true)
  })

  it('le mur 3D est percé des ouvertures et sa face intérieure suit le dessin', () => {
    const r = room()
    const o = outerPts(r)
    const full = buildWall(wallSeg(r, 0), o[0], o[1], 15, 250, 250, [])
    const holed = buildWall(wallSeg(r, 0), o[0], o[1], 15, 250, 250, [{ id: 'd', kind: 'door', x: 100, w: 80, h: 200, sill: 0 }])
    const area = (g: ReturnType<typeof buildWall>['inner']) => {
      const p = g.getAttribute('position')
      const idx = g.getIndex()!
      let s = 0
      for (let k = 0; k < idx.count; k += 3) {
        const v = [0, 1, 2].map((j) => [p.getX(idx.getX(k + j)), p.getY(idx.getX(k + j)), p.getZ(idx.getX(k + j))])
        const a = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]]
        const b = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]]
        s += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2
      }
      return s
    }
    expect(area(full.inner)).toBeCloseTo(4 * 2.5, 5)
    expect(area(holed.inner)).toBeCloseTo(4 * 2.5 - 0.8 * 2, 5)
    // uv : coin gauche en bas = (0, 0), la normale regarde l'intérieur (+z pour le mur du haut)
    const n = full.inner.getAttribute('normal')
    expect(n.getZ(0)).toBeCloseTo(1)
    const uv = full.inner.getAttribute('uv')
    expect([uv.getX(0), uv.getY(0)]).toEqual([0, 0])
  })
})

/** Pièce 400 × 300 avec une cheminée de 100 cm (40 cm de saillie) au milieu du mur du haut. */
const chimney = (): RoomPlan => ({
  pts: [[0, 0], [150, 0], [150, 40], [250, 40], [250, 0], [400, 0], [400, 300], [0, 300]].map(([x, y]) => ({ x, y })),
  walls: ['a', 'c1', 'c2', 'c3', 'b', 'r', 'bas', 'g'].map((id) => ({ id, openings: [] })),
  height: 250,
  thickness: 15,
  floor: '#c8a57a',
})

describe('murs liés', () => {
  it('murs contigus collés ; murs séparés par une cheminée espacés de sa largeur', () => {
    const r = chimney()
    const all = groupLayout(r, ['a', 'c1', 'c2', 'c3', 'b'])
    expect(all.segs.map((s) => [s.id, s.x, s.len])).toEqual([['a', 0, 150], ['c1', 150, 40], ['c2', 190, 100], ['c3', 290, 40], ['b', 330, 150]])
    expect(all.gaps).toEqual([])
    const sep = groupLayout(r, ['b', 'a'])
    expect(sep.segs.map((s) => [s.id, s.x])).toEqual([['a', 0], ['b', 250]])
    expect(sep.gaps).toEqual([{ x: 150, w: 100 }])
    expect(sep.width).toBe(400)
    // le déroulé passe par le coin du début du tour : mur de gauche puis mur du haut
    expect(groupLayout(r, ['a', 'g']).segs.map((s) => s.id)).toEqual(['g', 'a'])
  })

  it('un mur coupé reste lié ; un groupe d’un seul mur disparaît', () => {
    const r = { ...room(), groups: [{ id: 'G', walls: ['a', 'b'] }] }
    const sp = splitWall(r, 0, 'n')
    expect(sp.groups![0].walls).toEqual(['a', 'b', 'n'])
    expect(cleanGroups({ ...r, groups: [{ id: 'G', walls: ['a', 'zz'] }] }).groups).toEqual([])
  })

  it('le dessin commun reprend les dessins des murs côte à côte, sans limite aux jonctions', () => {
    const r = chimney()
    const layout = groupLayout(r, ['a', 'b'])
    const d1 = defaultDoc()
    d1.wall = { w: 150, h: 250 }
    d1.shapes = [{ id: 's', pts: [{ x: 10, y: 10 }, { x: 20, y: 20 }], segs: [{ t: 'line' }], closed: false }]
    d1.fills = [{ id: 'f', seed: { x: 5, y: 5 }, colorId: d1.palette[0].id }]
    const d2 = defaultDoc()
    d2.palette = [{ id: 'x', name: 'Bleu', hex: d1.palette[0].hex }, { id: 'y', name: 'Neuf', hex: '#123456' }]
    d2.fills = [{ id: 'g', seed: { x: 5, y: 5 }, colorId: 'y' }, { id: 'h', seed: { x: 50, y: 5 }, colorId: 'x' }]
    const m = mergeDocs(layout, 250, [d1, d2])
    expect(m.wall).toEqual({ w: 400, h: 250 })
    expect(m.shapes[0].pts[0]).toEqual({ x: 10, y: 10 })
    // dessin continu : aucun trait ajouté aux jonctions
    expect(m.shapes).toHaveLength(1)
    // les anciens traits de jonction (pleine hauteur, sur un bord de mur) sont reconnus
    const seam = { id: 'j', pts: [{ x: 150, y: 0 }, { x: 150, y: 250 }], segs: [{ t: 'line' as const }], closed: false }
    const mine = { id: 'k', pts: [{ x: 150, y: 10 }, { x: 150, y: 250 }], segs: [{ t: 'line' as const }], closed: false }
    expect(seamLineIds({ ...m, shapes: [...m.shapes, seam, mine] }, [150, 250])).toEqual(['j'])
    expect(m.fills.map((f) => f.seed.x)).toEqual([5, 255, 300])
    // même teinte = même couleur ; nouvelle teinte ajoutée à la palette
    expect(m.fills[2].colorId).toBe(d1.palette[0].id)
    expect(m.palette.some((c) => c.hex === '#123456' && c.id === m.fills[1].colorId)).toBe(true)
  })
})

describe('persistance des pièces', () => {
  beforeEach(async () => {
    await flushPersistence()
    await db.delete()
    await db.open()
  })

  it('crée une pièce : 4 murs, chacun avec un dessin à sa taille', async () => {
    const p = await rooms.createRoomProject('Chambre', { w: 420, d: 310, h: 260 })
    const infos = await rooms.loadRoomWalls((await repo.getProject(p.id))!)
    expect(infos.map((i) => i.wall.name)).toEqual(['Mur 1', 'Mur 2', 'Mur 3', 'Mur 4'])
    expect(infos.map((i) => i.display!.state.wall)).toEqual([
      { w: 420, h: 260 }, { w: 310, h: 260 }, { w: 420, h: 260 }, { w: 310, h: 260 },
    ])
  })

  it('le plan modifié redimensionne les dessins (avec historique) et crée les nouveaux murs', async () => {
    const p = await rooms.createRoomProject('Salon')
    const r0 = p.room!
    const r1 = splitWall(setWallLength(r0, 0, 500)!, 1, 'nouveau')
    await rooms.saveRoom(p.id, r1)
    const infos = await rooms.loadRoomWalls((await repo.getProject(p.id))!)
    expect(infos).toHaveLength(5)
    expect(infos[0].display!.state.wall.w).toBe(500)
    expect(infos[0].display!.maxSeq).toBe(1)
    expect(infos[2].wall.id).toBe('nouveau')
    expect(infos[2].wall.name).toBe('Mur 5')
    expect(infos[2].display!.state.wall).toEqual({ w: 160, h: 250 })
    // annuler le plan : le mur retiré garde ses données
    await rooms.saveRoom(p.id, r0)
    const back = await rooms.loadRoomWalls((await repo.getProject(p.id))!)
    expect(back).toHaveLength(4)
    expect(back[0].display!.state.wall.w).toBe(400)
    expect(await db.walls.get('nouveau')).toBeTruthy()
  })

  it('la variante ouverte devient celle de la 3D ; contexte pièce d’une variante', async () => {
    const p = await rooms.createRoomProject('Bureau')
    const infos = await rooms.loadRoomWalls(p)
    const copy = await repo.snapshotVariant(infos[1].display!.id)
    await rooms.setDisplayVariant(infos[1].wall.id, copy.id)
    const ctx = await rooms.roomContext(copy)
    expect(ctx!.index).toBe(1)
    expect(ctx!.walls[1].variantId).toBe(copy.id)
    const solo = await repo.createProject('Mur seul')
    expect(await rooms.roomContext(solo.variant)).toBeNull()
  })

  it('transforme un mur seul en pièce', async () => {
    const { project, variant } = await repo.createProject('Mur', { w: 350, h: 240 })
    await rooms.convertToRoom(project.id)
    const p = (await repo.getProject(project.id))!
    expect(p.room!.walls).toHaveLength(4)
    const infos = await rooms.loadRoomWalls(p)
    expect(infos[0].display!.id).toBe(variant.id)
    expect(infos[1].display!.state.wall.h).toBe(240)
  })

  it('lier des murs : dessin commun, taille suivie, contexte de l’éditeur, import', async () => {
    const p = await rooms.createRoomProject('Liés')
    const r0 = p.room!
    const r1 = { ...r0, walls: r0.walls.map((w, i) => (i === 1 ? { ...w, openings: [newOpening('door', 320, 250, [])] } : w)) }
    await rooms.saveRoom(p.id, r1)
    const g = await rooms.createWallGroup(p.id, r1, [r1.walls[1].id, r1.walls[0].id])
    expect(g.walls).toEqual([r1.walls[0].id, r1.walls[1].id])
    const r2 = { ...r1, groups: [g] }
    await rooms.saveRoom(p.id, r2)
    const proj = (await repo.getProject(p.id))!
    const groups = await rooms.loadRoomGroups(proj)
    expect(groups.get(g.id)!.display!.state.wall).toEqual({ w: 720, h: 250 })
    expect(groups.get(g.id)!.wall.name).toBe('Mur 1 + Mur 2')
    // la taille du dessin commun suit le plan
    await rooms.saveRoom(p.id, setWallLength(r2, 0, 500)!)
    const g2 = (await rooms.loadRoomGroups((await repo.getProject(p.id))!)).get(g.id)!
    expect(g2.display!.state.wall.w).toBe(820)
    // dans l'éditeur : une seule surface pour les deux murs, la porte du mur 2 décalée de 500 cm
    const ctx = (await rooms.roomContext(g2.display!))!
    expect(ctx.walls.map((w) => w.name)).toEqual(['Mur 1 + Mur 2', 'Mur 3', 'Mur 4'])
    expect(ctx.index).toBe(0)
    expect(ctx.openings[0].x).toBe(500 + r1.walls[1].openings[0].x)
    expect(ctx.seams.map((x) => x.x)).toEqual([0, 500])
    // export / import : le groupe suit
    const file = JSON.parse(JSON.stringify(await serializeProject(p.id)))
    const { project: p2 } = await importProject(file)
    expect(p2.room!.groups).toHaveLength(1)
    const gi = (await rooms.loadRoomGroups(p2)).get(p2.room!.groups![0].id)!
    expect(gi.wall.group).toBe(true)
    expect(gi.display!.state.wall.w).toBe(820)
  })

  it('export / import d’une pièce : murs, ouvertures et variantes réindexés', async () => {
    const p = await rooms.createRoomProject('Export')
    const r = { ...p.room!, walls: p.room!.walls.map((w, i) => (i === 0 ? { ...w, openings: [newOpening('window', 400, 250, [])] } : w)) }
    await rooms.saveRoom(p.id, r)
    const file = JSON.parse(JSON.stringify(await serializeProject(p.id)))
    const { project: p2 } = await importProject(file)
    expect(p2.room!.walls).toHaveLength(4)
    expect(p2.room!.walls[0].openings).toHaveLength(1)
    const infos = await rooms.loadRoomWalls(p2)
    expect(infos.every((i) => i.display && i.display.projectId === p2.id)).toBe(true)
    expect(p2.room!.walls.map((w) => w.id)).not.toEqual(r.walls.map((w) => w.id))
    // un fichier dont le plan désigne un mur inconnu est refusé
    file.project.room.walls[0].id = 'inconnu'
    await expect(importProject(file)).rejects.toThrow('Fichier invalide')
  })
})
