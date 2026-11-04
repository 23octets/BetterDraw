import { requireSaved } from '../store/editor'
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

export async function navigate(path: string) {
  if (!await requireSaved()) return
  window.location.hash = path
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
