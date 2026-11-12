import { useEditor } from '../store/editor'
import { dashArray, LINE_STYLES } from '../geometry/grid'
import type { GridLineStyle } from '../model/types'

/** Réglages des lignes de grille : type de trait, épaisseur, opacité (aperçu en direct, une entrée d'historique par réglage). */
export function GridStyleControls({ compact }: { compact?: boolean }) {
  const grid = useEditor((s) => s.doc.grid)
  const preview = useEditor((s) => s.gridPreview)
  const commit = useEditor((s) => s.commit)
  const lw = preview?.lineWidth ?? grid.lineWidth ?? 1
  const lo = preview?.lineOpacity ?? grid.lineOpacity ?? 1
  const ls = preview?.lineStyle ?? grid.lineStyle ?? 'dashed'

  const setPreview = (p: Partial<{ lineWidth: number; lineOpacity: number }>) =>
    useEditor.setState({ gridPreview: { lineWidth: lw, lineOpacity: lo, lineStyle: ls, ...p } })
  const save = () => {
    const p = useEditor.getState().gridPreview
    if (!p) return
    commit(`Style de la grille : ${p.lineWidth} px, ${Math.round(p.lineOpacity * 100)} %`, (d) => {
      d.grid.lineWidth = p.lineWidth
      d.grid.lineOpacity = p.lineOpacity
    })
    useEditor.setState({ gridPreview: null })
  }
  const setStyle = (style: GridLineStyle) =>
    commit(`Trait de la grille : ${LINE_STYLES.find((s) => s.id === style)?.label}`, (d) => {
      d.grid.lineStyle = style
    })

  return (
    <div className={`grid-style${compact ? ' compact' : ''}`}>
      <div className="field">
        <span>Type de trait</span>
        <div className="line-styles" role="radiogroup" aria-label="Type de trait">
          {LINE_STYLES.map((s) => (
            <button
              key={s.id}
              className={`line-style${ls === s.id ? ' on' : ''}`}
              role="radio"
              aria-checked={ls === s.id}
              title={s.label}
              data-testid={`line-style-${s.id}`}
              onClick={() => setStyle(s.id)}
            >
              <svg viewBox="0 0 60 10" preserveAspectRatio="none">
                <line x1={2} x2={58} y1={5} y2={5} strokeDasharray={dashArray(s.id, 2)} />
              </svg>
              {!compact && <span>{s.label}</span>}
            </button>
          ))}
        </div>
      </div>
      <label className="range-field">
        <span>Épaisseur <b>{lw.toFixed(1)}&nbsp;px</b></span>
        <input type="range" min={0.5} max={4} step={0.1} value={lw} data-testid="grid-width"
          onChange={(e) => setPreview({ lineWidth: +e.target.value })} onPointerUp={save} onKeyUp={save} />
      </label>
      <label className="range-field">
        <span>Opacité <b>{Math.round(lo * 100)} %</b></span>
        <input type="range" min={0.1} max={1} step={0.05} value={lo} data-testid="grid-opacity"
          onChange={(e) => setPreview({ lineOpacity: +e.target.value })} onPointerUp={save} onKeyUp={save} />
      </label>
      <div className="grid-sample" style={{ opacity: lo }}>
        <svg viewBox="0 0 120 40" preserveAspectRatio="none">
          <rect width="60" height="40" fill="#f4f1ea" />
          <rect x="60" width="60" height="40" fill="#c8643b" />
          {[20, 40, 60, 80, 100].map((x) => (
            <line key={x} x1={x} x2={x} y1={0} y2={40} stroke={x < 60 ? 'rgba(200,100,59,0.75)' : 'rgba(20,20,22,0.6)'} strokeWidth={lw} strokeDasharray={dashArray(ls, lw)} />
          ))}
          <line x1={0} x2={120} y1={20} y2={20} stroke="rgba(20,20,22,0.6)" strokeWidth={lw} strokeDasharray={dashArray(ls, lw)} />
        </svg>
      </div>
      <button className="ghost small" onClick={() => commit('Style de la grille par défaut', (d) => { d.grid.lineWidth = 1; d.grid.lineOpacity = 1; d.grid.lineStyle = 'dashed' })}>
        Réinitialiser
      </button>
    </div>
  )
}
