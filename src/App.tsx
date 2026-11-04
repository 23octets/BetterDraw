import { useRoute } from './ui/router'
import { Home } from './ui/Home'
import { Editor } from './ui/Editor'
import { ProjectPage } from './ui/ProjectPage'
import { CompareView } from './ui/CompareView'
import { lazy, Suspense } from 'react'

// la 3D (three.js) n'est chargée qu'à l'ouverture d'une pièce
const RoomPage = lazy(() => import('./room/RoomPage').then((m) => ({ default: m.RoomPage })))

export default function App() {
  const route = useRoute()
  if (route.name === 'editor') return <Editor key={route.variantId} variantId={route.variantId} />
  if (route.name === 'project') return <ProjectPage key={route.projectId} projectId={route.projectId} />
  if (route.name === 'room')
    return (
      <Suspense fallback={<div className="loading">Chargement…</div>}>
        <RoomPage key={route.projectId} projectId={route.projectId} />
      </Suspense>
    )
  if (route.name === 'compare') return <CompareView ids={route.ids} />
  return <Home />
}
