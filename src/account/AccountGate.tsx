import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from 'react'
import { requireSaved } from '../store/editor'
import { StorageGate } from '../ui/StorageGate'

const ConnectedAccount = lazy(() => import('./ConnectedAccount'))
const AccountContext = createContext<(() => void) | null>(null)
export function AccountButton() {
  const connect = useContext(AccountContext)
  return connect ? <button onClick={connect}>Se connecter</button> : null
}

export function AccountGate({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [retry, setRetry] = useState(0)
  const [failed, setFailed] = useState(false)
  const connectedMode = localStorage.getItem('frsque:account-mode') === 'cloud'
  useEffect(() => {
    let alive = true
    async function configure() {
      try {
        const configured = import.meta.env.VITE_DEXIE_DATABASE_URL
        const databaseUrl = configured || (await (await fetch('/api/cloud', { cache: 'no-store' })).json()).databaseUrl
        if (databaseUrl && !/^https:\/\/[^/]+\.dexie\.cloud\/?$/.test(databaseUrl)) throw new Error('URL Dexie invalide')
        if (alive) { setUrl(databaseUrl || null); setFailed(false) }
      } catch { if (alive) { setUrl(null); setFailed(true) } }
    }
    void configure()
    return () => { alive = false }
  }, [retry])
  const connect = async () => {
    if (!await requireSaved()) return
    localStorage.setItem('frsque:account-mode', 'cloud')
    window.location.hash = '/'
    window.location.reload()
  }
  if (connectedMode) {
    if (url === undefined) return <main className="missing"><p>Connexion au service de comptes…</p></main>
    if (!url) return <main className="missing"><h1>Connexion indisponible</h1>
      <p>{failed ? 'Le service ne répond pas. Réessayez dans un instant.' : 'Les comptes ne sont pas encore activés sur cette version.'}</p>
      <button onClick={() => { setUrl(undefined); setRetry((r) => r + 1) }}>Réessayer</button>
      <button onClick={() => { localStorage.removeItem('frsque:account-mode'); window.location.reload() }}>Ouvrir mes projets locaux</button>
    </main>
    return <Suspense fallback={<main className="missing">Ouverture du compte…</main>}><ConnectedAccount databaseUrl={url}>{children}</ConnectedAccount></Suspense>
  }
  return <AccountContext value={url ? () => { void connect() } : null}><StorageGate>{children}</StorageGate></AccountContext>
}
