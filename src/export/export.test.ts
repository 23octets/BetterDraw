import { beforeEach, describe, expect, it } from 'vitest'
import { coverPageSvg, cellPageSvg, drawingSvg, exportPages } from './svg'
import { defaultDoc } from '../model/defaults'
import { gridLayout } from '../geometry/grid'
import type { DocState } from '../model/types'
import { db } from '../store/db'
import * as repo from '../store/repo'
import { flushPersistence, useEditor } from '../store/editor'
import { importProject, serializeProject, InvalidHistoryError } from './project'
import { fillAt } from '../store/fills'

function sampleDoc(): DocState {
  const d = defaultDoc()
  d.shapes = [{ id: 'a', pts: [{ x: 100, y: 0 }, { x: 100, y: 250 }], segs: [{ t: 'line' }], closed: false }]
  const r = fillAt(d, { x: 50, y: 50 }, d.palette[0].id)!
  d.fills = r.fills
  d.printCells = ['B2', 'A1']
  return d
}

describe('export SVG / PDF', () => {
  it('cover page has grid labels, grid cotes and the surface legend', () => {
    const svg = coverPageSvg(sampleDoc(), { project: 'Chambre', variant: 'Variante A' })
    expect(svg).toContain('Chambre — Variante A')
    expect(svg).toContain('>A<')
    expect(svg).toContain('>F<')
    expect(svg).toContain('>250<')
    expect(svg).toContain('Bleu canard')
    expect(svg).toContain('2.50 m²')
    expect(svg).toContain('Cases détaillées : B2, A1')
  })
  it('cell page shows only grid cotes of the cell', () => {
    const d = sampleDoc()
    const cell = gridLayout(d.wall, d.grid).cells.find((c) => c.id === 'B2')!
    const svg = cellPageSvg(d, cell, { project: 'Chambre', variant: 'A' })
    expect(svg).toContain('Case B2')
    expect(svg).toContain('horizontal de 50 à 100 cm')
    expect(svg).toContain('vertical de 50 à 100 cm')
    expect(svg).toContain('>100 cm<')
    expect(svg).toContain('clipPath')
  })
  it('one page for the overview plus one per selected cell, sorted', () => {
    const pages = exportPages(sampleDoc(), { project: 'P', variant: 'V' })
    expect(pages).toHaveLength(3)
    expect(pages[1]).toContain('Case A1')
    expect(pages[2]).toContain('Case B2')
  })
  it('only uses characters the standard PDF fonts can print', () => {
    for (const p of exportPages(sampleDoc(), { project: 'Chambre de Léa', variant: 'Variante A' })) {
      const text = p.replace(/<[^>]+>/g, '')
      for (const ch of text) expect(ch.charCodeAt(0) < 256 || '—’…œŒ€'.includes(ch), `caractère ${ch}`).toBe(true)
    }
  })
  it('never includes reference images', () => {
    const d = sampleDoc()
    d.images = [{ id: 'i', blobId: 'b', name: 'x', x: 0, y: 0, w: 10, h: 10, opacity: 1, locked: false, visible: true }]
    for (const p of exportPages(d, { project: 'P', variant: 'V' })) expect(p).not.toContain('<image')
    expect(drawingSvg(d)).not.toContain('<image')
  })
  it('plain drawing svg is in centimetres', () => {
    expect(drawingSvg(sampleDoc(), { labels: false })).toContain('width="300cm" height="250cm"')
  })
})

describe('sauvegarde du projet', () => {
  beforeEach(async () => {
    await flushPersistence()
    await db.delete()
    await db.open()
  })
  it('round-trips a project with variants, history and images', async () => {
    const { project, variant } = await repo.createProject('Salon')
    await useEditor.getState().load(variant.id)
    useEditor.getState().commit('w', (d) => { d.wall.w = 333 })
    useEditor.getState().commit('img', (d) => { d.images.push({ id: 'i1', blobId: 'blob1', name: 'x', x: 0, y: 0, w: 10, h: 10, opacity: 0.5, locked: false, visible: true }) })
    await flushPersistence()
    await db.images.put({ id: 'blob1', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 })
    const b = await repo.snapshotVariant(variant.id)
    const file = JSON.parse(JSON.stringify(await serializeProject(project.id)))
    expect(file.variants).toHaveLength(2)
    expect(file.entries).toHaveLength(2)
    expect(file.images).toHaveLength(1)
    const { project: p2, variants } = await importProject(file)
    expect(p2.id).not.toBe(project.id)
    expect(variants).toHaveLength(2)
    const b2 = variants.find((v) => v.name === b.name)!
    expect(b2.parentId).toBe(variants.find((v) => v.name === 'Variante A')!.id)
    expect((await repo.listProjects())).toHaveLength(2)
    // l'historique importé fonctionne
    const a2 = variants.find((v) => v.name === 'Variante A')!
    await useEditor.getState().load(a2.id)
    await useEditor.getState().goTo(0)
    expect(useEditor.getState().doc.wall.w).toBe(300)
    await expect(importProject({ nope: true })).rejects.toThrow('pas un projet')
  })

  it('exporte au format frsque et relit les sauvegardes faites sous l’ancien nom', async () => {
    const { project } = await repo.createProject('Ancien')
    const file = JSON.parse(JSON.stringify(await serializeProject(project.id)))
    expect(file.format).toBe('frsque-project')
    const { project: imported } = await importProject({ ...file, format: 'betterdraw-project' })
    expect(imported.name).toBe('Ancien')
    await expect(importProject({ ...file, format: 'autre-chose' })).rejects.toThrow('pas un projet')
  })
})

describe('import : sécurité', () => {
  beforeEach(async () => {
    await flushPersistence()
    await db.delete()
    await db.open()
  })
  async function validFile() {
    const { project } = await repo.createProject('Ok')
    return JSON.parse(JSON.stringify(await serializeProject(project.id)))
  }
  it('refuse une version inconnue et conserve les anciens fichiers valides', async () => {
    const f = await validFile()
    await expect(importProject({ ...f, version: 999 })).rejects.toThrow('Version de sauvegarde')
    delete f.variants[0].state.grid.lineStyle
    delete f.variants[0].state.grid.subStep
    await expect(importProject(f)).resolves.toBeDefined()
  })
  it('propose la récupération quand un inverse détruit le mur', async () => {
    const f = await validFile()
    f.variants[0].headSeq = f.variants[0].maxSeq = 1
    f.entries = [{ variantId: f.variants[0].id, seq: 1, label: 'mur', ts: 1,
      patches: [], inverse: [{ op: 'replace', path: ['wall'], value: null }] }]
    const count = await db.projects.count()
    await expect(importProject(f)).rejects.toThrow('historique corrompu')
    expect(await db.projects.count()).toBe(count)
    const { variants } = await importProject(f, { withoutHistory: true })
    expect(variants[0].maxSeq).toBe(0)
    expect(variants[0].state.wall.w).toBe(300)
  })
  it('détecte les séquences manquantes et les références absentes', async () => {
    const f = await validFile()
    f.variants[0].headSeq = f.variants[0].maxSeq = 2
    await expect(importProject(f)).rejects.toThrow('historique corrompu')
    f.variants[0].headSeq = f.variants[0].maxSeq = 0
    f.variants[0].state.images = [{ id: 'i', blobId: 'absent', name: 'x', x: 0, y: 0, w: 1, h: 1, opacity: 1, locked: false, visible: true }]
    await expect(importProject(f)).rejects.toThrow('images absentes')
    const recovered = await importProject(f, { withoutHistory: true })
    expect(recovered.variants[0].state.images).toEqual([])
  })
  it('conserve une sauvegarde des données disponibles et récupère un ancien historique incomplet', async () => {
    const { project, variant } = await repo.createProject('Ancien')
    await useEditor.getState().load(variant.id)
    useEditor.getState().commit('image perdue', (d) => {
      d.images.push({ id: 'im', blobId: 'perdu', name: 'x', x: 0, y: 0, w: 1, h: 1, opacity: 1, locked: false, visible: true })
    })
    useEditor.getState().commit('retrait', (d) => { d.images = [] })
    const file = await serializeProject(project.id)
    expect(file.warnings).toHaveLength(1)
    await expect(importProject(file)).rejects.toThrow('historique corrompu')
    const { variants } = await importProject(file, { withoutHistory: true })
    expect(variants[0].maxSeq).toBe(0)
  })
  it('récupère le dessin même si un média réservé à l’historique est invalide', async () => {
    const f = await validFile()
    f.images = [{ id: 'ancien', dataUrl: 'invalide' }]
    await expect(importProject(f)).rejects.toThrow('historique corrompu')
    await expect(importProject(f, { withoutHistory: true })).resolves.toBeDefined()
  })
  it('conserve le gris de secours des anciennes zones sans couleur', async () => {
    const f = await validFile()
    f.variants[0].state.fills = [{ id: 'zone', colorId: 'supprimé', seed: { x: 1, y: 1 } }]
    const { variants } = await importProject(f)
    expect(variants[0].state.fills[0].colorId).toBe('supprimé')
  })
  it('propose la récupération pour une métadonnée de filiation invalide', async () => {
    const f = await validFile()
    f.variants[0].parentSeq = 'x'
    await expect(importProject(f)).rejects.toBeInstanceOf(InvalidHistoryError)
    const { variants } = await importProject(f, { withoutHistory: true })
    expect(variants[0].parentSeq).toBeUndefined()
  })
  it('sauvegarde les images présentes uniquement dans les inverses après les écritures en attente', async () => {
    const { project, variant } = await repo.createProject('Images')
    await db.images.put({ id: 'source', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 })
    await db.images.put({ id: 'blob', dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 })
    await useEditor.getState().load(variant.id)
    useEditor.getState().commit('ajout', (d) => {
      d.images.push({ id: 'im', blobId: 'blob', name: 'photo', x: 0, y: 0, w: 10, h: 10, opacity: 1, locked: false, visible: true,
        edit: { sourceBlobId: 'source', quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], full: { w: 1, h: 1 }, realSize: null, rect: { x: 0, y: 0, w: 1, h: 1 }, crop: { x: 0, y: 0, w: 1, h: 1 } } })
    })
    useEditor.getState().commit('retrait', (d) => { d.images = [] })
    const file = await serializeProject(project.id)
    expect(file.images.map((im) => im.id).sort()).toEqual(['blob', 'source'])
    await db.delete()
    await db.open()
    const { variants } = await importProject(JSON.parse(JSON.stringify(file)))
    const restored = await repo.moveHead(variants[0].id, 1)
    expect(await db.images.get(restored.state.images[0].blobId)).toBeDefined()
    expect(await db.images.get(restored.state.images[0].edit!.sourceBlobId)).toBeDefined()
    const damaged = await serializeProject(variants[0].projectId)
    damaged.images = damaged.images.filter((im) => im.id !== 'source')
    const recovered = await importProject(damaged, { withoutHistory: true })
    expect(recovered.variants[0].state.images[0].blobId).toBe('blob')
    expect(recovered.variants[0].state.images[0].edit).toBeUndefined()
  })
  it('rejects an injected color', async () => {
    const f = await validFile()
    f.variants[0].state.palette[0].hex = '#000"/><script>alert(1)</script><x a="'
    await expect(importProject(f)).rejects.toThrow('Fichier invalide')
  })
  it('rejects non-numeric geometry and dangerous history paths', async () => {
    const f = await validFile()
    f.variants[0].state.wall.w = '300"><script>'
    await expect(importProject(f)).rejects.toThrow('Fichier invalide')
    const g = await validFile()
    g.entries = [{ variantId: g.variants[0].id, seq: 1, label: 'x', ts: 1, patches: [{ op: 'replace', path: ['__proto__', 'x'], value: 1 }], inverse: [] }]
    await expect(importProject(g)).rejects.toThrow('Fichier invalide')
  })
  it('rejects non-image data urls and drops unknown fields', async () => {
    const f = await validFile()
    f.images = [{ id: 'i', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=', width: 1, height: 1 }]
    await expect(importProject(f)).rejects.toThrow('Fichier invalide')
    const g = await validFile()
    g.variants[0].evil = '<script>'
    const { variants } = await importProject(g)
    expect('evil' in variants[0]).toBe(false)
  })
  it('the svg export neutralises bad colors anyway', () => {
    const d = sampleDoc()
    d.background.hex = '"><script>alert(1)</script>'
    expect(coverPageSvg(d, { project: 'P', variant: 'V' })).not.toContain('<script>')
  })
})
