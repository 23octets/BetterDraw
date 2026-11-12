import { useEffect, useState, type ReactNode } from 'react'
import { CloudDB, type CloudCommit } from './cloud'
import { ProjectSync, type SyncView } from './sync'
import { db, FrsqueDB, setDatabase } from '../store/db'
import { captureProject, parseProject } from '../export/project'
import { hasUnsavedWork, requireSaved } from '../store/editor'
import { StorageGate } from '../ui/StorageGate'
import { useModal } from '../ui/useModal'

const cloudInstances = new Map<string, CloudDB>()
function getCloud(url: string) {
  let instance = cloudInstances.get(url)
  if (!instance) { instance = new CloudDB(url); cloudInstances.set(url, instance) }
  return instance
}
const initialView: SyncView = { busy: false, error: '', conflicts: [], pendingRemote: false }

export default function ConnectedAccount({ databaseUrl, children }: { databaseUrl: string; children: ReactNode }) {
  const [cloud] = useState(() => getCloud(databaseUrl))
  const [user, setUser] = useState(cloud.cloud.currentUser.value)
  const [readyFor, setReadyFor] = useState('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('initial')
  const [view, setView] = useState(initialView)
  const [sync, setSync] = useState<ProjectSync | null>(null)
  const [guestCount, setGuestCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!sync || phase !== 'in-sync' || view.busy) return
    const timer = setTimeout(() => { void sync.compact().catch(() => {}) }, 30_000)
    return () => clearTimeout(timer)
  }, [phase, view.busy, sync])
  useEffect(() => {
    const userSubscription = cloud.cloud.currentUser.subscribe(setUser)
    const syncSubscription = cloud.cloud.syncState.subscribe((s) => setPhase(s.phase))
    void cloud.open().catch(() => setError('Impossible d’ouvrir le compte. Réessayez en rechargeant la page.'))
    return () => { userSubscription.unsubscribe(); syncSubscription.unsubscribe() }
  }, [cloud])
  const userId = user.isLoggedIn ? user.userId : undefined
  useEffect(() => {
    if (!userId) return
    let alive = true
    let engine: ProjectSync | undefined
    async function open() {
      const key = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(databaseUrl + '\n' + userId))
      const suffix = Array.from(new Uint8Array(key), (b) => b.toString(16).padStart(2, '0')).join('')
      if (!alive) return
      const local = new FrsqueDB('betterdraw-account-' + suffix, true)
      await local.open()
      if (!alive) { local.close(); return }
      setDatabase(local)
      engine = new ProjectSync(local, cloud, () => {
        const hash = window.location.hash.replace(/^#\/?/, '')
        return !hash && !hasUnsavedWork()
      }, (next) => { if (alive) setView(next) })
      engine.start()
      setSync(engine)
      setReadyFor(userId!)
      const guest = new FrsqueDB()
      try { setGuestCount(await guest.projects.count()) } finally { guest.close() }
    }
    void open().catch(() => setError('Impossible d’ouvrir les projets du compte. Vos données locales sont conservées.'))
    return () => { alive = false; engine?.stop() }
  }, [cloud, databaseUrl, userId])

  async function logout() {
    if (busy || !sync || !await requireSaved()) return
    setBusy(true); setError('')
    try {
      if (window.location.hash.replace(/^#\/?/, '')) throw new Error('Revenez à l’accueil avant de vous déconnecter.')
      if (view.conflicts.length) throw new Error('Choisissez les versions à conserver avant de vous déconnecter.')
      await sync.flush()
      await cloud.cloud.sync({ purpose: 'push', wait: true })
      if (cloud.cloud.syncState.value.phase !== 'in-sync') throw new Error('Attendez la fin de la synchronisation avant de vous déconnecter.')
      sync.stop()
      await cloud.cloud.logout()
      window.location.hash = '/'
      window.location.reload()
    } catch (e) { sync.stop(); sync.start(); setError(e instanceof Error ? e.message : 'Déconnexion impossible. Réessayez en ligne.') }
    finally { setBusy(false) }
  }
  async function importGuest() {
    if (importing || !await requireSaved()) return
    setImporting(true); setError('')
    const guest = new FrsqueDB()
    try {
      const projects = await guest.projects.toArray()
      for (const project of projects) {
        const sourceId = 'guest:' + project.id
        if (await db.imports.get(sourceId)) continue
        const parsed = await parseProject(await captureProject(guest, project.id))
        await db.transaction('rw', db.tables, async () => {
          if (await db.imports.get(sourceId)) return
          await db.projects.add(parsed.project)
          await db.walls.bulkAdd(parsed.walls)
          await db.variants.bulkAdd(parsed.variants)
          await db.entries.bulkAdd(parsed.entries)
          for (const image of parsed.images) if (!await db.images.get(image.id)) await db.images.add(image)
          await db.imports.add({ sourceId, targetId: parsed.project.id })
        })
      }
      setGuestCount(0)
      await sync?.flush()
    } catch { setError('Copie impossible. Les projets originaux restent disponibles en mode local. Réessayez.') }
    finally { guest.close(); setImporting(false) }
  }
  if (!userId || readyFor !== userId) return <main className="missing account-login">
    <h1>Vos projets, sur tous vos appareils</h1>
    <p>Connectez-vous avec le code reçu par email. Les projets de votre compte restent privés.</p>
    <p>Le lancement est limité à 25 comptes.</p>
    <button disabled={user.isLoading} onClick={() => { setError(''); void cloud.cloud.login({ grant_type: 'otp' }).catch(() => setError('Connexion interrompue. Vous pouvez réessayer.')) }}>Se connecter par email</button>
    <button onClick={() => { localStorage.removeItem('frsque:account-mode'); window.location.hash = '/'; window.location.reload() }}>Continuer avec mes projets locaux</button>
    {error && <p role="alert">{error}</p>}
    <LoginDialog cloud={cloud} />
  </main>
  const status = view.conflicts.length ? 'Versions à départager' : view.pendingRemote ? 'Mise à jour disponible' : view.error || (phase === 'error' ? 'Synchronisation impossible — vos modifications restent sur cet appareil.'
    : phase === 'offline' ? 'Hors ligne — synchronisation au retour du réseau'
    : phase !== 'in-sync' || view.busy ? 'Synchronisation en cours…' : 'Synchronisé')
  return <>
    <div className="account-bar">
      <span>{user.email}</span><span role="status">{status}</span>
      <button disabled={busy} onClick={() => { void sync?.flush().then(() => cloud.cloud.sync({ purpose: 'push', wait: true })).catch(() => setError('Synchronisation impossible. Réessayez en ligne.')) }}>Synchroniser</button>
      <button disabled={busy} onClick={() => { void logout() }}>Se déconnecter</button>
    </div>
    {error && <p className="account-notice" role="alert">{error}</p>}
    {guestCount > 0 && <div className="account-notice"><span>{guestCount} projet(s) sur cet appareil. Copier ces projets dans votre compte ? Les originaux seront conservés.</span> <button disabled={importing} onClick={() => { void importGuest() }}>{importing ? 'Copie…' : 'Copier mes projets locaux'}</button></div>}
    {view.pendingRemote && <p className="account-notice">Une version plus récente est disponible. Revenez à l’accueil pour la recevoir. <button onClick={() => { void requireSaved().then((saved) => { if (saved) window.location.hash = '/' }) }}>Revenir à l’accueil</button></p>}
    {view.conflicts.map((conflict) => <div className="account-notice" key={conflict.projectId}>
      <strong>Ce projet a été modifié sur plusieurs appareils.</strong><p>Les versions sont conservées séparément. Téléchargez-les avant de choisir celle à utiliser. Revenez à l’accueil pour faire ce choix.</p>
      {conflict.heads.map((head, index) => <div key={head.id}>
        <span>{head.name} — version {index + 1} — {new Date(head.createdAt).toLocaleString('fr-FR')}</span>{' '}
        {head.payload && <button onClick={() => { void downloadVersion(head) }}>Télécharger</button>}{' '}
        <button disabled={busy} onClick={() => { setBusy(true); void sync?.resolve(conflict.projectId, head.id).catch((e) => setError(e.message)).finally(() => setBusy(false)) }}>{head.payload ? 'Utiliser cette version' : 'Confirmer la suppression'}</button>
      </div>)}
    </div>)}
    <StorageGate>{children}</StorageGate>
    <LoginDialog cloud={cloud} />
  </>
}

async function downloadVersion(head: CloudCommit) {
  if (!head.payload) return
  const url = URL.createObjectURL(head.payload)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'version-' + head.id + '.frsque.json'; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function LoginDialog({ cloud }: { cloud: CloudDB }) {
  const [interaction, setInteraction] = useState(cloud.cloud.userInteraction.value)
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useModal(interaction ? '#account-dialog' : ':not(*)', () => interaction?.onCancel())
  useEffect(() => {
    const sub = cloud.cloud.userInteraction.subscribe((ui) => { setInteraction(ui); setValue(''); setSubmitting(false) })
    return () => sub.unsubscribe()
  }, [cloud])
  if (!interaction) return null
  const isEmail = interaction.type === 'email'
  const isOtp = interaction.type === 'otp'
  const alerts = interaction.alerts.map((alert) => {
    if (['USER_NOT_ACCEPTED', 'NO_SEATS_AVAILABLE', 'LICENSE_LIMIT_REACHED'].includes(alert.messageCode)) return 'Les inscriptions sont fermées : les places disponibles sont déjà attribuées.'
    if (alert.messageCode === 'INVALID_OTP') return 'Code incorrect ou expiré. Réessayez.'
    if (alert.messageCode === 'INVALID_EMAIL') return 'Vérifiez votre adresse email.'
    if (alert.messageCode === 'OTP_SENT') return 'Un code vient de vous être envoyé par email.'
    return alert.type === 'error' ? 'Connexion impossible. Réessayez dans un instant.' : alert.message
  })
  return <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) interaction.onCancel() }}><section id="account-dialog" className="modal account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
    <h2 id="account-title">{isEmail ? 'Se connecter par email' : isOtp ? 'Votre code de connexion' : 'Connexion'}</h2>
    {alerts.map((message, index) => <p role="status" key={index}>{message}</p>)}
    <form onSubmit={(event) => { event.preventDefault(); setSubmitting(true); interaction.onSubmit(isEmail ? { email: value.trim() } : isOtp ? { otp: value.trim() } : {}) }}>
      {(isEmail || isOtp) && <label>{isEmail ? 'Adresse email' : 'Code reçu par email'}<input autoFocus type={isEmail ? 'email' : 'text'} autoComplete={isEmail ? 'email' : 'one-time-code'} required value={value} onChange={(e) => setValue(e.target.value)} /></label>}
      <div className="account-actions"><button type="submit" disabled={submitting}>{submitting ? 'Vérification…' : isEmail ? 'Recevoir un code' : isOtp ? 'Se connecter' : 'Continuer'}</button><button type="button" onClick={() => interaction.onCancel()}>Annuler</button></div>
    </form>
  </section></div>
}
