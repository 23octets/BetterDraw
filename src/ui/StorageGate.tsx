import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../store/db'
import { cleanOrphanImagesBestEffort, storageError } from '../store/storage'

export function StorageGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  async function open() {
    try { await db.open(); setReady(true); setError(''); void cleanOrphanImagesBestEffort() }
    catch (e) { setError(storageError(e)) }
  }
  useEffect(() => { void open() }, [])
  if (error) return <main className="missing" role="alert"><h1>Stockage local indisponible</h1><p>{error}</p><button onClick={open}>Réessayer</button></main>
  return ready ? children : <p>Ouverture du stockage local…</p>
}
