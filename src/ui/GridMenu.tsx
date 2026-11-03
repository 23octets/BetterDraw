import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { Icon } from './icons'

/** Bouton « Grille » du header : afficher / masquer + menu épaisseur et opacité des lignes. */
export function GridMenu() {
  const grid = useEditor((s) => s.doc.grid)
  const commit = useEditor((s) => s.commit)
  const preview = useEditor((s) => s.gridPreview)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const lw = preview?.lineWidth ?? grid.lineWidth ?? 1
  const lo = preview?.lineOpacity ?? grid.lineOpacity ?? 1

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

  const setPreview = (p: Partial<{ lineWidth: number; lineOpacity: number }>) =>
    useEditor.setState({ gridPreview: { lineWidth: lw, lineOpacity: lo, ...p } })
  const save = () => {
    const p = useEditor.getState().gridPreview
    if (!p) return
    commit(`Style de la grille : ${p.lineWidth} px, ${Math.round(p.lineOpacity * 100)} %`, (d) => {
      d.grid.lineWidth = p.lineWidth
      d.grid.lineOpacity = p.lineOpacity
    })
    useEditor.setState({ gridPreview: null })
  }

  return (
    <div className="split-btn" ref={ref}>
      <button
        className={`icon-btn${grid.show ? ' on' : ''}`}
        aria-pressed={grid.show}
        data-testid="toggle-grid"
        title={grid.show ? 'Masquer la grille' : 'Afficher la grille'}
        onClick={() => commit(grid.show ? 'Masquer la grille' : 'Afficher la grille', (d) => { d.grid.show = !grid.show })}
      >
        <Icon name="grid" /> Grille
      </button>
      <button className={`icon-btn caret${open ? ' open' : ''}`} aria-expanded={open} aria-label="Réglages des lignes de la grille" data-testid="grid-menu" onClick={() => setOpen((o) => !o)}>
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Lignes de la grille" data-testid="grid-popover">
          <h4>Lignes de la grille</h4>
          <label className="range-field">
            <span>Épaisseur <b>{lw.toFixed(1)} px</b></span>
            <input type="range" min={0.5} max={4} step={0.1} value={lw} data-testid="grid-width"
              onChange={(e) => setPreview({ lineWidth: +e.target.value })} onPointerUp={save} onKeyUp={save} />
          </label>
          <label className="range-field">
            <span>Opacité <b>{Math.round(lo * 100)} %</b></span>
            <input type="range" min={0.1} max={1} step={0.05} value={lo} data-testid="grid-opacity"
              onChange={(e) => setPreview({ lineOpacity: +e.target.value })} onPointerUp={save} onKeyUp={save} />
          </label>
          <div className="grid-sample" style={{ ['--gw' as string]: lw, opacity: lo }}>
            <svg viewBox="0 0 120 40" preserveAspectRatio="none">
              <rect width="60" height="40" fill="#f4f1ea" />
              <rect x="60" width="60" height="40" fill="#c8643b" />
              {[20, 40, 60, 80, 100].map((x) => <line key={x} x1={x} x2={x} y1={0} y2={40} stroke={x < 60 ? 'rgba(200,100,59,0.75)' : 'rgba(20,20,22,0.6)'} />)}
              <line x1={0} x2={120} y1={20} y2={20} stroke="rgba(20,20,22,0.6)" />
            </svg>
          </div>
          <button className="ghost small" onClick={() => {
            commit('Style de la grille par défaut', (d) => { d.grid.lineWidth = 1; d.grid.lineOpacity = 1 })
          }}>Réinitialiser</button>
          <p className="hint">Également appliqué au PDF chantier.</p>
        </div>
      )}
    </div>
  )
}
