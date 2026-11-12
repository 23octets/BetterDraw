import { afterEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { nanoid } from 'nanoid'
import { defaultDoc } from '../model/defaults'
import { FrsqueDB } from '../store/db'
import { captureProject, type ProjectFile } from '../export/project'
import { applyRemote, fingerprint, ProjectSync, projectHeads } from './sync'
import type { CloudDB } from './cloud'

const databases: Dexie[] = []
function local() { const db = new FrsqueDB('sync-test-' + nanoid(), true); databases.push(db); return db }
function cloud() {
  const db = new Dexie('cloud-test-' + nanoid())
  db.version(1).stores({ commits: 'id, projectId' }); databases.push(db)
  return db as CloudDB
}
function file(name = 'Mur'): ProjectFile {
  return { format: 'frsque-project', version: 1, exportedAt: 1,
    project: { id: 'p1', name, createdAt: 1, updatedAt: 1 },
    walls: [{ id: 'w1', projectId: 'p1', name: 'Mur', standalone: true }],
    variants: [{ id: 'v1', projectId: 'p1', wallId: 'w1', name: 'A', createdAt: 1, updatedAt: 1, headSeq: 0, maxSeq: 0, state: defaultDoc() }], entries: [], images: [],
  }
}
async function seed(db: FrsqueDB, snapshot = file()) {
  const { project, walls, variants, entries, images } = snapshot
  await db.projects.put(project); await db.walls.bulkPut(walls); await db.variants.bulkPut(variants)
  await db.entries.bulkPut(entries); await db.images.bulkPut(images)
}
const engine = (localDb: FrsqueDB, cloudDb: CloudDB, canApply = () => true) => new ProjectSync(localDb, cloudDb, canApply, () => {})
afterEach(async () => { await Promise.all(databases.splice(0).map((db) => db.delete())) })

describe('synchronisation des projets', () => {
  it('transfère automatiquement un projet complet et conserve les identifiants', async () => {
    const a = local(), b = local(), server = cloud()
    await seed(a)
    const sa = engine(a, server), sb = engine(b, server)
    await sa.flush(); await sb.flush()
    expect((await captureProject(b, 'p1')).variants[0].id).toBe('v1')
    const count = await server.commits.count()
    await sb.flush(); await sa.flush()
    expect(await server.commits.count()).toBe(count)
    await a.projects.update('p1', { name: 'Renommé' })
    await sa.flush(); await sb.flush()
    expect((await b.projects.get('p1'))?.name).toBe('Renommé')
  })
  it('conserve deux branches hors ligne et permet un choix explicite', async () => {
    const a = local(), b = local(), server = cloud()
    await seed(a)
    const sa = engine(a, server), sb = engine(b, server)
    await sa.flush(); await sb.flush()
    await a.projects.update('p1', { name: 'Sur A' }); await b.projects.update('p1', { name: 'Sur B' })
    await sa.flush(); await sb.flush(); await sa.flush()
    const heads = projectHeads(await server.commits.toArray())
    expect(heads).toHaveLength(2)
    expect(heads.map((h) => h.name).sort()).toEqual(['Sur A', 'Sur B'])
    const chosen = heads.find((h) => h.name === 'Sur B')!
    await sa.resolve('p1', chosen.id); await sb.flush()
    expect(projectHeads(await server.commits.toArray())).toHaveLength(1)
    expect((await a.projects.get('p1'))?.name).toBe('Sur B')
    expect((await b.projects.get('p1'))?.name).toBe('Sur B')
    expect(await server.commits.get(heads[0].id)).toBeDefined()
  })
  it('synchronise une suppression sans ressusciter le projet sur un autre appareil', async () => {
    const a = local(), b = local(), server = cloud()
    await seed(a)
    const sa = engine(a, server), sb = engine(b, server)
    await sa.flush(); await sb.flush(); await a.projects.delete('p1')
    await sa.flush(); await sb.flush(); await sb.flush()
    expect(await b.projects.get('p1')).toBeUndefined()
    expect(projectHeads(await server.commits.toArray())[0].payload).toBeNull()
  })
  it('ne remplace pas un dessin ouvert ni un projet modifié pendant la réception', async () => {
    const a = local(), b = local(), server = cloud()
    await seed(a)
    const sa = engine(a, server), sb = engine(b, server, () => false)
    await sa.flush(); await sb.flush()
    expect(await b.projects.get('p1')).toBeUndefined()
    const old = await fingerprint(null)
    await seed(b, file('Travail local'))
    expect(await applyRemote(b, 'p1', file('Distant'), old, ['remote'])).toBe(false)
    expect((await b.projects.get('p1'))?.name).toBe('Travail local')
  })
  it('valide l’historique avant de remplacer les données locales', async () => {
    const db = local(); await seed(db)
    const bad = file(); bad.variants[0].maxSeq = 4
    await expect(applyRemote(db, 'p1', bad, await fingerprint(await captureProject(db, 'p1')), ['bad'])).rejects.toThrow()
    expect((await db.projects.get('p1'))?.name).toBe('Mur')
  })
  it('libère les anciennes charges utiles sans perdre la filiation ni le projet actif', async () => {
    const a = local(), b = local(), server = cloud()
    await seed(a)
    const sa = engine(a, server)
    await sa.flush()
    for (let i = 0; i < 6; i++) { await a.projects.update('p1', { name: 'Version ' + i }); await sa.flush() }
    await sa.compact()
    const commits = await server.commits.toArray()
    expect(commits.filter((c) => c.payload)).toHaveLength(3)
    expect(projectHeads(commits)).toHaveLength(1)
    await engine(b, server).flush()
    expect((await b.projects.get('p1'))?.name).toBe('Version 5')
  })
  it('transfère les images et leur historique sans modifier les données des invités', async () => {
    const guest = local(), account = local(), server = cloud(), other = local()
    const snapshot = file()
    snapshot.images = [{ id: 'image1', dataUrl: 'data:image/png;base64,aGVsbG8=', width: 1, height: 1 }]
    snapshot.variants[0].state.images = [{ id: 'ref1', blobId: 'image1', name: 'Image', x: 0, y: 0, w: 10, h: 10, opacity: 1, locked: false, visible: true }]
    await seed(guest, snapshot); await seed(account, snapshot)
    await engine(account, server).flush(); await engine(other, server).flush()
    expect((await other.images.get('image1'))?.dataUrl).toBe(snapshot.images[0].dataUrl)
    await account.projects.delete('p1')
    expect((await guest.projects.get('p1'))?.name).toBe('Mur')
  })
})
