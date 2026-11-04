import { useEditor, flushPersistence } from '../store/editor'
import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'editor'; variantId: string }
  | { name: 'project'; projectId: string }
  | { name: 'compare'; ids: string[] }
  | { name: 'room'; projectId: string }

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  const [a, b] = h.split('/')
  if (a === 'v' && b) return { name: 'editor', variantId: b }
  if (a === 'r' && b) return { name: 'room', projectId: b }
  if (a === 'p' && b) return { name: 'project', projectId: b }
  if (a === 'compare' && b) return { name: 'compare', ids: b.split(',').filter(Boolean) }
  return { name: 'home' }
}

const guards = new Set<() => boolean>()
const flushers = new Set<() => Promise<unknown>>()
export function registerNavigationGuard(guard: () => boolean, flush?: () => Promise<unknown>) {
  guards.add(guard)
  if (flush) flushers.add(flush)
  return () => { guards.delete(guard); if (flush) flushers.delete(flush) }
}

export function navigate(path: string) {
  window.location.hash = path
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    let previous = window.location.hash
    const on = async () => {
      const next = window.location.hash
      if (next === previous) return
      await Promise.all([flushPersistence(), ...[...flushers].map((flush) => flush())])
      if (window.location.hash !== next) return
      if ((useEditor.getState().persistenceError || [...guards].some((guard) => guard())) &&
        !confirm('Quitter abandonne les modifications non enregistrées. Avez-vous téléchargé la sauvegarde de secours ?')) {
        window.history.pushState(null, '', window.location.pathname + window.location.search + previous)
        return
      }
      previous = next
      setRoute(parseHash(next))
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
