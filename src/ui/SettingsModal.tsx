import { useModal } from './useModal'
import { useEditor } from '../store/editor'
import { NumberField } from './fields'
import { ORIGINS } from './SidePanel'
import { gridLayout } from '../geometry/grid'
import { Icon } from './icons'
import { GridStyleControls } from './GridStyleControls'

/** Réglages de l'espace de travail : taille du mur et origine des cotes. */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  useModal('[data-testid=settings-modal]', onClose)
  const doc = useEditor((s) => s.doc)
  const commit = useEditor((s) => s.commit)
  const { wall, grid } = doc
  const room = useEditor((s) => s.room)
  const layout = gridLayout(wall, grid)


  // aperçu proportionnel du mur
  const k = 220 / Math.max(wall.w, wall.h)
  const pw = wall.w * k
  const ph = wall.h * k
  const corner = { tl: [0, 0], tr: [pw, 0], bl: [0, ph], br: [pw, ph] } as const

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-small" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Réglages" data-testid="settings-modal">
        <header className="modal-head">
          <strong>Réglages de l’espace de travail</strong>
          <div className="spacer" />
          <button className="icon-btn ghost" onClick={onClose} aria-label="Fermer" data-testid="close-settings"><Icon name="close" /></button>
        </header>
        <div className="modal-pad">
          {room ? (
            <section className="settings-block">
              <h4>Taille du mur</h4>
              <p className="hint" data-testid="wall-size-locked">{wall.w} × {wall.h} cm · {((wall.w * wall.h) / 10000).toFixed(2)} m². La taille de ce mur vient du plan de la pièce : change-la depuis la pièce (longueur du mur, hauteur sous plafond).</p>
            </section>
          ) : (
          <section className="settings-block">
            <h4>Taille du mur</h4>
            <div className="row">
              <NumberField label="Largeur" suffix="cm" min={10} max={5000} value={wall.w} testId="wall-w"
                onCommit={(w) => commit(`Largeur du mur : ${w} cm`, (d) => { d.wall.w = w })} />
              <NumberField label="Hauteur" suffix="cm" min={10} max={5000} value={wall.h} testId="wall-h"
                onCommit={(h) => commit(`Hauteur du mur : ${h} cm`, (d) => { d.wall.h = h })} />
            </div>
            <p className="hint">Surface : {((wall.w * wall.h) / 10000).toFixed(2)} m² · grille de {layout.cols} × {layout.rows} cases</p>
          </section>
          )}
          <section className="settings-block">
            <h4>Origine des cotes et des repères</h4>
            <p className="hint">Le coin d’où partent les mesures (0 cm) et où commence la case A1. Au mur, choisis un coin fiable, en général le bas, côté sol.</p>
            <div className="origin-chooser">
              <svg viewBox={`-16 -16 ${pw + 32} ${ph + 32}`} width={pw + 32} height={ph + 32} className="origin-preview">
                <rect x={0} y={0} width={pw} height={ph} className="op-wall" />
                {ORIGINS.map((o) => {
                  const [cx, cy] = corner[o.id]
                  const on = grid.origin === o.id
                  return (
                    <g key={o.id} className={`op-corner${on ? ' on' : ''}`} onClick={() => commit('Origine de la grille', (d) => { d.grid.origin = o.id })} data-testid={`origin-${o.id}`} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.dispatchEvent(new MouseEvent('click', { bubbles: true })) } }} role="button" aria-pressed={on} aria-label={o.label}>
                      <circle cx={cx} cy={cy} r={on ? 11 : 8} />
                      {on && <text x={cx} y={cy + 4} textAnchor="middle">0</text>}
                    </g>
                  )
                })}
                {/* flèches des axes depuis l'origine */}
                {(() => {
                  const [ox, oy] = corner[grid.origin]
                  const dx = grid.origin.endsWith('l') ? 1 : -1
                  const dy = grid.origin.startsWith('t') ? 1 : -1
                  return (
                    <g className="op-axes">
                      <line x1={ox + dx * 16} y1={oy} x2={ox + dx * 70} y2={oy} />
                      <line x1={ox} y1={oy + dy * 16} x2={ox} y2={oy + dy * 70} />
                      {/* libellés à l'intérieur du mur, le long des axes */}
                      <text x={ox + dx * 40} y={oy + dy * 14 + (dy > 0 ? 0 : 6)} textAnchor="middle">A, B…</text>
                      <text x={ox + dx * 8} y={oy + dy * 46} textAnchor={dx > 0 ? 'start' : 'end'}>1, 2…</text>
                    </g>
                  )
                })()}
              </svg>
              <div className="origin-list" role="radiogroup">
                {ORIGINS.map((o) => (
                  <label key={o.id} className="check">
                    <input type="radio" name="origin" checked={grid.origin === o.id} onChange={() => commit('Origine de la grille', (d) => { d.grid.origin = o.id })} />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          </section>
          <section className="settings-block">
            <h4>Aimantage</h4>
            <p className="hint">Pas de la grille fine sur laquelle s’accrochent les points tracés et les mesures (en plus des traits et de la grille de carroyage). Alt désactive l’aimantage.</p>
            <div className="row">
              <NumberField label="Pas d’aimantage" suffix="cm" min={0.5} max={100} value={grid.snapStep} testId="snap-step"
                onCommit={(v) => commit(`Aimantage : ${v} cm`, (d) => { d.grid.snapStep = v })} />
              <span />
            </div>
          </section>
          <section className="settings-block">
            <h4>Lignes de la grille</h4>
            <GridStyleControls />
          </section>
        </div>
      </div>
    </div>
  )
}
