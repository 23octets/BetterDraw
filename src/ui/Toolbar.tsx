import { Fragment, useEffect, useRef, useState } from 'react'
import { useEditor, type Tool } from '../store/editor'
import { Icon } from './icons'

export const TOOLS: { id: Tool; label: string; hint: string; key: string; group: number }[] = [
  { id: 'select', label: 'Sélection', hint: 'Sélectionner, déplacer, modifier', key: 'v', group: 0 },
  { id: 'polyline', label: 'Ligne', hint: 'A pour un arc tangent', key: 'l', group: 1 },
  { id: 'arc', label: 'Arc', hint: 'Départ, arrivée, point de passage', key: 'c', group: 1 },
  { id: 'bezier', label: 'Courbe de Bézier', hint: 'Cliquer-glisser pour courber', key: 'b', group: 1 },
  { id: 'trim', label: 'Couper', hint: 'Supprime un bout de trait entre deux croisements', key: 'x', group: 1 },
  { id: 'fill', label: 'Pot de peinture', hint: 'Peindre une zone fermée', key: 'f', group: 2 },
  { id: 'erase', label: 'Gomme couleur', hint: 'Retirer la couleur d’une zone', key: 'e', group: 2 },
  { id: 'pick', label: 'Pipette', hint: 'Reprendre la couleur d’une zone', key: 'i', group: 2 },
  { id: 'measure', label: 'Mesure', hint: 'Distance entre deux points', key: 'm', group: 3 },
  { id: 'image', label: 'Images de référence', hint: 'Déplacer et agrandir les images', key: 'g', group: 3 },
]

export function Toolbar() {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const mode = useEditor((s) => s.mode)
  // « chaud » : une infobulle est déjà visible → les suivantes s'affichent sans animation ni délai
  const [warm, setWarm] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const enter = () => {
    clearTimeout(timer.current)
    if (!warm) timer.current = setTimeout(() => setWarm(true), 140)
  }
  const leave = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setWarm(false), 350)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
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
    <nav className={`toolbar${warm ? ' warm' : ''}`} aria-label="Outils" onMouseLeave={leave} data-testid="toolbar">
      {TOOLS.map((t, i) => (
        <Fragment key={t.id}>
          {i > 0 && TOOLS[i - 1].group !== t.group && <span className="toolbar-sep" />}
          <button
            className={`tool-btn${tool === t.id ? ' on' : ''}`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            data-testid={`tool-${t.id}`}
            disabled={mode !== 'edit'}
            onClick={() => setTool(t.id)}
            onMouseEnter={enter}
          >
            <Icon name={t.id} size={20} />
            <span className="tooltip" role="tooltip">
              <span className="tooltip-title">
                {t.label} <kbd className="key small">{t.key.toUpperCase()}</kbd>
              </span>
              <span className="tooltip-hint">{t.hint}</span>
            </span>
          </button>
        </Fragment>
      ))}
    </nav>
  )
}
