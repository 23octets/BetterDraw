import { liveQuery } from 'dexie'
import { nanoid } from 'nanoid'
import { captureProject, parseProject, type ProjectFile } from '../export/project'
import { FrsqueDB } from '../store/db'
import type { CloudCommit, CloudDB } from './cloud'

export function projectHeads(commits: CloudCommit[]): CloudCommit[] {
  const parents = new Set(commits.flatMap((c) => c.parents))
  return commits.filter((c) => !parents.has(c.id)).sort((a, b) => a.id.localeCompare(b.id))
}

export async function fingerprint(file: ProjectFile | null): Promise<string> {
  if (!file) return 'deleted'
  const { exportedAt: _time, ...content } = file
  const bytes = new TextEncoder().encode(JSON.stringify(content, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
    }
    return value
  }))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function readLocal(db: FrsqueDB, id: string) {
  return await db.projects.get(id) ? captureProject(db, id) : null
}

/** Remplacement transactionnel, après validation, sans modifier un projet changé entre-temps. */
export async function applyRemote(db: FrsqueDB, id: string, file: ProjectFile | null, expected: string, heads: string[], canApply = () => true) {
  const parsed = file ? await parseProject(file, { preserveIds: true }) : null
  if (parsed && parsed.project.id !== id) throw new Error('Identifiant de projet incohérent')
  const nextFingerprint = await fingerprint(file)
  // Le hash est calculé avant la transaction ; une deuxième lecture atomique détecte toute course.
  const before = await readLocal(db, id)
  if (await fingerprint(before) !== expected) return false
  const serializedBefore = before ? JSON.stringify({ ...before, exportedAt: 0 }) : null
  if (!canApply()) return false
  return db.transaction('rw', db.tables, async () => {
    if (!canApply()) return false
    const current = await readLocal(db, id)
    if ((current ? JSON.stringify({ ...current, exportedAt: 0 }) : null) !== serializedBefore) return false
    const variants = await db.variants.where('projectId').equals(id).primaryKeys()
    for (const variantId of variants) await db.entries.where('variantId').equals(variantId).delete()
    await db.variants.where('projectId').equals(id).delete()
    await db.walls.where('projectId').equals(id).delete()
    await db.projects.delete(id)
    if (parsed) {
      // Les IDs globaux ne doivent jamais remplacer les données d’un autre projet.
      for (const v of parsed.variants) {
        const existing = await db.variants.get(v.id)
        if (existing) throw new Error('Identifiant de variante déjà utilisé')
      }
      for (const w of parsed.walls) {
        if (await db.walls.get(w.id)) throw new Error('Identifiant de mur déjà utilisé')
      }
      await db.projects.add(parsed.project)
      await db.walls.bulkAdd(parsed.walls)
      await db.variants.bulkAdd(parsed.variants)
      await db.entries.bulkAdd(parsed.entries)
      for (const image of parsed.images) {
        const existing = await db.images.get(image.id)
        if (existing && existing.dataUrl !== image.dataUrl) throw new Error('Identifiant d’image déjà utilisé')
        if (!existing) await db.images.add(image)
      }
    }
    await db.syncHeads.put({ projectId: id, heads, fingerprint: nextFingerprint })
    return true
  })
}

export interface SyncView {
  busy: boolean
  error: string
  pendingRemote: boolean
  conflicts: { projectId: string; heads: CloudCommit[] }[]
}

export class ProjectSync {
  private running: Promise<void> | null = null
  private again = false
  private stopped = false
  private timer?: ReturnType<typeof setTimeout>
  private subscriptions: { unsubscribe(): void }[] = []
  private authenticatedUser?: string
  private view: SyncView = { busy: false, error: '', pendingRemote: false, conflicts: [] }
  private local: FrsqueDB
  private cloud: CloudDB
  private canApply: () => boolean
  private changed: (view: SyncView) => void
  constructor(local: FrsqueDB, cloud: CloudDB, canApply: () => boolean, changed: (view: SyncView) => void) {
    this.local = local; this.cloud = cloud; this.canApply = canApply; this.changed = changed
    this.authenticatedUser = cloud.cloud?.currentUser.value.userId
  }

  start() {
    this.stopped = false
    this.subscriptions.push(liveQuery(async () => {
      // Toutes les écritures utiles, même celles qui ne changent pas updatedAt (undo, renommage…).
      await Promise.all(this.local.tables.map((t) => t.toArray()))
    }).subscribe({ next: () => this.schedule(), error: () => this.fail() }))
    this.subscriptions.push(liveQuery(() => this.cloud.commits.toArray()).subscribe({ next: () => this.schedule(), error: () => this.fail() }))
    if (this.cloud.cloud) {
      this.subscriptions.push(this.cloud.cloud.events.syncComplete.subscribe(this.schedule))
      this.subscriptions.push(this.cloud.cloud.blobProgress.subscribe((progress) => { if (!progress.isDownloading) this.schedule() }))
    }
    window.addEventListener('online', this.schedule)
    window.addEventListener('hashchange', this.schedule)
    this.schedule()
  }
  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    this.subscriptions.forEach((s) => s.unsubscribe())
    this.subscriptions = []
    window.removeEventListener('online', this.schedule)
    window.removeEventListener('hashchange', this.schedule)
  }
  private emit(patch: Partial<SyncView>) { this.view = { ...this.view, ...patch }; this.changed(this.view) }
  private fail(error?: unknown) {
    console.warn('[frsque] Synchronisation :', error instanceof Error ? error.message : 'Stockage inaccessible')
    this.emit({ busy: false, error: 'Synchronisation impossible. Vos modifications restent sur cet appareil. Réessayez.' }) }
  schedule = () => {
    if (this.stopped) return
    clearTimeout(this.timer)
    this.emit({ busy: true })
    this.timer = setTimeout(() => { void this.flush().catch((error) => this.fail(error)) }, 3000)
  }
  flush(): Promise<void> {
    if (this.running) { this.again = true; return this.running }
    this.running = (async () => {
      this.emit({ busy: true, error: '' })
      const run = async () => {
        do { this.again = false; await this.reconcile() } while (this.again && !this.stopped)
      }
      // Un seul rapprochement par compte, même avec plusieurs onglets sur cet appareil.
      if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(this.local.name + ':sync', run)
      else await run()
      this.emit({ busy: false })
    })().finally(() => { this.running = null })
    return this.running
  }
  private async publish(projectId: string, file: ProjectFile | null, parents: string[]) {
    if (this.stopped || (this.cloud.cloud && (!this.cloud.cloud.currentUser.value.isLoggedIn || this.cloud.cloud.currentUser.value.userId !== this.authenticatedUser))) {
      throw new Error('Le compte a changé. Reconnectez-vous pour synchroniser.')
    }
    if (file?.warnings?.length) throw new Error('Des images sont manquantes. Exportez un secours avant de continuer.')
    const commit: CloudCommit = {
      id: nanoid(24), projectId, parents, createdAt: Date.now(),
      name: file?.project.name ?? 'Projet supprimé',
      payload: file ? new Blob([JSON.stringify(file)], { type: 'application/json' }) : null,
    }
    await this.cloud.commits.add(commit)
    // En cas d’arrêt entre ces deux bases, le rapprochement suivant reconnaît le contenu identique.
    await this.local.syncHeads.put({ projectId, heads: [commit.id], fingerprint: await fingerprint(file) })
    return commit
  }
  private async reconcile() {
    const commits = await this.cloud.commits.toArray()
    const metadata = await this.local.syncHeads.toArray()
    const ids = new Set([...commits.map((c) => c.projectId), ...metadata.map((m) => m.projectId), ...await this.local.projects.toCollection().primaryKeys()])
    const conflicts: SyncView['conflicts'] = []
    let pendingRemote = false
    for (const id of ids) {
      if (this.stopped) return
      const meta = await this.local.syncHeads.get(id)
      const file = await readLocal(this.local, id)
      const hash = await fingerprint(file)
      const versions = commits.filter((c) => c.projectId === id)
      let heads = projectHeads(versions)
      const sameAsKnown = meta?.fingerprint === hash
      if ((!meta && file) || (meta && !sameAsKnown)) {
        // Si une publication s’est arrêtée avant l’écriture du repère local, ne pas créer une branche artificielle.
        let identical: CloudCommit | undefined
        for (const head of heads) {
          const remote = head.payload ? JSON.parse(await head.payload.text()) as ProjectFile : null
          if (await fingerprint(remote) === hash) { identical = head; break }
        }
        if (identical) await this.local.syncHeads.put({ projectId: id, heads: [identical.id], fingerprint: hash })
        else {
          const commit = await this.publish(id, file, meta?.heads ?? [])
          heads = projectHeads([...versions, commit])
        }
      }
      if (heads.length > 1) { conflicts.push({ projectId: id, heads }); continue }
      if (heads.length !== 1) continue
      const latestMeta = await this.local.syncHeads.get(id)
      if (latestMeta?.heads.length === 1 && latestMeta.heads[0] === heads[0].id) continue
      if (!this.canApply()) { pendingRemote = true; continue }
      const payload = heads[0].payload
      const remote = payload ? JSON.parse(await payload.text()) as ProjectFile : null
      if (!await applyRemote(this.local, id, remote, hash, [heads[0].id], this.canApply)) {
        if (this.canApply()) this.again = true
        else pendingRemote = true
      }
    }
    this.emit({ conflicts, pendingRemote })
  }
  /** Garder les branches actives et deux anciennes charges utiles ; conserver toute la filiation. */
  async compact() {
    if (this.stopped) return
    const run = async () => {
      const candidates = await this.cloud.commits.toArray()
      if (!candidates.some((c) => c.payload && candidates.filter((x) => x.projectId === c.projectId && x.payload).length > 3)) return
      // Ne jamais libérer le dernier état distant au profit d’un état encore seulement local.
      if (this.cloud.cloud) {
        await this.cloud.cloud.sync({ purpose: 'push', wait: true })
        if (this.cloud.cloud.syncState.value.phase !== 'in-sync' || this.cloud.cloud.currentUser.value.userId !== this.authenticatedUser) return
      }
      if (this.stopped) return
      const commits = await this.cloud.commits.toArray()
      const ids = new Set(commits.map((c) => c.projectId))
      for (const id of ids) {
        const versions = commits.filter((c) => c.projectId === id)
        const heads = new Set(projectHeads(versions).map((c) => c.id))
        const old = versions.filter((c) => !heads.has(c.id) && c.payload && !c.archived)
          .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).slice(2)
        if (old.length) await this.cloud.commits.where('id').anyOf(old.map((c) => c.id)).modify({ payload: null, archived: true })
      }
    }
    if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(this.local.name + ':sync', run)
    else await run()
  }
  async resolve(projectId: string, chosenId: string) {
    await this.flush()
    const run = async () => {
      if (!this.canApply()) throw new Error('Revenez à l’accueil avant de choisir une version.')
      const heads = projectHeads(await this.cloud.commits.where('projectId').equals(projectId).toArray())
      const chosen = heads.find((h) => h.id === chosenId)
      if (!chosen) throw new Error('Les versions ont changé. Réessayez.')
      const file = chosen.payload ? JSON.parse(await chosen.payload.text()) as ProjectFile : null
      const current = await readLocal(this.local, projectId)
      const hash = await fingerprint(current)
      if (!await applyRemote(this.local, projectId, file, hash, heads.map((h) => h.id), this.canApply)) throw new Error('Le projet a changé. Réessayez.')
      await this.publish(projectId, await readLocal(this.local, projectId), heads.map((h) => h.id))
    }
    if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(this.local.name + ':sync', run)
    else await run()
    await this.flush()
  }
}
