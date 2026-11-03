import { useEffect } from 'react'
import { useEditor, type Tool } from '../store/editor'

const I = {
  select: <path d="M5 3l12 8-5 1.5L9.5 18z" />,
  polyline: <path d="M3 17l5-9 5 5 6-9" fill="none" />,
  arc: <path d="M3 17a9 9 0 0 1 16 0" fill="none" />,
  bezier: <path d="M3 17C6 3 14 21 19 5" fill="none" />,
  fill: (
    <>
      <path d="M4 11l6-6 7 7-6 6z" />
      <path d="M18 14c1.5 2 2 3 2 4a2 2 0 0 1-4 0c0-1 .5-2 2-4z" />
    </>
  ),
  erase: <path d="M4 15l8-8 6 6-5 5H7zM9 18h10" fill="none" />,
  pick: <path d="M14 4l4 4-9 9H5v-4zM12 6l4 4" fill="none" />,
  measure: <path d="M3 15l12-12 4 4L7 19zM7 11l2 2M10 8l2 2M13 5l2 2" fill="none" />,
  image: (
    <>
      <rect x="3" y="4" width="16" height="14" rx="1" fill="none" />
      <path d="M3 15l5-5 4 4 3-3 4 4" fill="none" />
    </>
  ),
}

export const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Sélection', key: 'v' },
  { id: 'polyline', label: 'Ligne / polyligne (A : arc tangent)', key: 'l' },
  { id: 'arc', label: 'Arc (3 points)', key: 'c' },
  { id: 'bezier', label: 'Courbe de Bézier', key: 'b' },
  { id: 'fill', label: 'Pot de peinture', key: 'f' },
  { id: 'erase', label: 'Gomme couleur', key: 'e' },
  { id: 'pick', label: 'Pipette', key: 'i' },
  { id: 'measure', label: 'Mesure', key: 'm' },
  { id: 'image', label: 'Images de référence', key: 'g' },
]

export function Toolbar() {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const mode = useEditor((s) => s.mode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      const t = TOOLS.find((t) => t.key === e.key.toLowerCase())
      if (t && useEditor.getState().mode === 'edit') setTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTool])
  if (mode === 'consult') return <nav className="toolbar" />
  return (
    <nav className="toolbar" aria-label="Outils">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={tool === t.id ? 'on' : ''}
          title={`${t.label} (${t.key.toUpperCase()})`}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          data-testid={`tool-${t.id}`}
          disabled={mode !== 'edit'}
          onClick={() => setTool(t.id)}
        >
          <svg viewBox="0 0 22 22" width="22" height="22">{I[t.id as keyof typeof I]}</svg>
        </button>
      ))}
    </nav>
  )
}
