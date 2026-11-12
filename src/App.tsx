import { useEditor } from './store/editor'
import { useRoute } from './ui/router'
import { Home } from './ui/Home'
import { lazy, Suspense } from 'react'

const Editor = lazy(() => import('./ui/Editor').then((m) => ({ default: m.Editor })))

const CompareView = lazy(() => import('./ui/CompareView').then((m) => ({ default: m.CompareView })))

const ProjectPage = lazy(() => import('./ui/ProjectPage').then((m) => ({ default: m.ProjectPage })))

// la 3D (three.js) n'est chargée qu'à l'ouverture d'une pièce
const RoomPage = lazy(() => import('./room/RoomPage').then((m) => ({ default: m.RoomPage })))

export default function App() {
  const route = useRoute()
  const blocked = useEditor((s) => s.saveError ? s.variant?.id : null)
  if (blocked || route.name === 'editor') {
    const id = blocked || (route.name === 'editor' ? route.variantId : '')
    return (
      <Suspense fallback={<div className="loading">Chargement…</div>}>
        <Editor key={id} variantId={id} />
      </Suspense>
    )
  }
  if (route.name === 'project')
    return (
      <Suspense fallback={<div className="loading">Chargement…</div>}>
        <ProjectPage key={route.projectId} projectId={route.projectId} />
      </Suspense>
    )
  if (route.name === 'room')
    return (
      <Suspense fallback={<div className="loading">Chargement…</div>}>
        <RoomPage key={route.projectId} projectId={route.projectId} />
      </Suspense>
    )
  if (route.name === 'compare') return (
    <Suspense fallback={<div className="loading">Chargement…</div>}>
      <CompareView ids={route.ids} />
    </Suspense>
  )
  return <Home />
}
