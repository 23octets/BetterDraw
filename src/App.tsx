import { useRoute } from './ui/router'
import { Home } from './ui/Home'
import { Editor } from './ui/Editor'

export default function App() {
  const route = useRoute()
  if (route.name === 'editor') return <Editor key={route.variantId} variantId={route.variantId} />
  return <Home />
}
