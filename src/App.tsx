import { useRoute } from './ui/router'
import { Home } from './ui/Home'
import { Editor } from './ui/Editor'
import { ProjectPage } from './ui/ProjectPage'
import { CompareView } from './ui/CompareView'

export default function App() {
  const route = useRoute()
  if (route.name === 'editor') return <Editor key={route.variantId} variantId={route.variantId} />
  if (route.name === 'project') return <ProjectPage key={route.projectId} projectId={route.projectId} />
  if (route.name === 'compare') return <CompareView ids={route.ids} />
  return <Home />
}
