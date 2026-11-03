import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { Icon } from './icons'
import { GridStyleControls } from './GridStyleControls'

/** Bouton « Grille » du header : afficher / masquer + menu épaisseur et opacité des lignes. */
export function GridMenu() {
  const grid = useEditor((s) => s.doc.grid)
  const commit = useEditor((s) => s.commit)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="split-btn" ref={ref}>
      <button
        className={`icon-btn${open ? ' on' : ''}${grid.show ? '' : ' grid-off'}`}
        aria-expanded={open}
        data-testid="grid-menu"
        title="Réglages des lignes de la grille"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="grid" /> Grille
      </button>
      <button
        className={`icon-btn eye-btn${grid.show ? '' : ' off'}`}
        aria-pressed={grid.show}
        aria-label={grid.show ? 'Masquer la grille' : 'Afficher la grille'}
        data-testid="toggle-grid"
        title={grid.show ? 'Masquer la grille' : 'Afficher la grille'}
        onClick={() => commit(grid.show ? 'Masquer la grille' : 'Afficher la grille', (d) => { d.grid.show = !grid.show })}
      >
        <Icon name={grid.show ? 'eye' : 'eyeOff'} size={16} />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Lignes de la grille" data-testid="grid-popover">
          <h4>Lignes de la grille</h4>
          <GridStyleControls compact />
          <p className="hint">Également appliqué au PDF chantier.</p>
        </div>
      )}
    </div>
  )
}
