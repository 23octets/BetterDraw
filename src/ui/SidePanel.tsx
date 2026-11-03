import { useEditor } from '../store/editor'
import { NumberField } from './fields'
import type { GridOrigin } from '../model/types'
import { commonStepSuggestions, gridLayout, stepSuggestions, stepYOf } from '../geometry/grid'
import { Icon } from './icons'

export function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="panel-section" data-testid={testId}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export function WallSection() {
  const wall = useEditor((s) => s.doc.wall)
  const commit = useEditor((s) => s.commit)
  return (
    <Section title="Mur" testId="wall-section">
      <div className="row">
        <NumberField label="Largeur" suffix="cm" min={10} max={5000} value={wall.w} testId="wall-w"
          onCommit={(w) => commit(`Largeur du mur : ${w} cm`, (d) => { d.wall.w = w })} />
        <NumberField label="Hauteur" suffix="cm" min={10} max={5000} value={wall.h} testId="wall-h"
          onCommit={(h) => commit(`Hauteur du mur : ${h} cm`, (d) => { d.wall.h = h })} />
      </div>
      <p className="hint">Surface : {((wall.w * wall.h) / 10000).toFixed(2)} m²</p>
    </Section>
  )
}

export const ORIGINS: { id: GridOrigin; label: string }[] = [
  { id: 'tl', label: 'Haut gauche' },
  { id: 'tr', label: 'Haut droite' },
  { id: 'bl', label: 'Bas gauche' },
  { id: 'br', label: 'Bas droite' },
]

export function GridSection() {
  const doc = useEditor((s) => s.doc)
  const commit = useEditor((s) => s.commit)
  const g = doc.grid
  const layout = gridLayout(doc.wall, g)
  const linked = g.stepY === undefined
  const sy = stepYOf(g)
  const lastW = layout.vLines.length > 1 ? Math.abs(layout.vLines.at(-1)!.cote - layout.vLines.at(-2)!.cote) : 0
  const lastH = layout.hLines.length > 1 ? Math.abs(layout.hLines.at(-1)!.cote - layout.hLines.at(-2)!.cote) : 0
  const restW = lastW && Math.abs(lastW - g.step) > 1e-6 ? lastW : 0
  const restH = lastH && Math.abs(lastH - sy) > 1e-6 ? lastH : 0
  return (
    <Section title="Grille de carroyage" testId="grid-section">
      <div className="step-row">
        <NumberField label="Pas ↔" suffix="cm" min={1} max={1000} value={g.step} testId="grid-step"
          onCommit={(step) => commit(`Pas horizontal : ${step} cm`, (d) => { d.grid.step = step })} />
        <button
          className={`icon-btn small link-btn${linked ? ' on' : ''}`}
          aria-pressed={linked}
          data-testid="link-steps"
          title={linked ? 'Pas identiques en horizontal et en vertical — cliquer pour les séparer' : 'Pas différents — cliquer pour utiliser le même pas'}
          onClick={() => commit(linked ? 'Pas vertical séparé' : 'Pas vertical identique', (d) => {
            if (linked) d.grid.stepY = d.grid.step
            else delete d.grid.stepY
          })}
        >
          <Icon name={linked ? 'link' : 'unlink'} size={15} />
        </button>
        {/* toujours affiché ; lié, il modifie aussi le pas horizontal */}
        <NumberField label="Pas ↕" suffix="cm" min={1} max={1000} value={sy} testId="grid-step-y"
          onCommit={(v) => commit(linked ? `Pas de grille : ${v} cm` : `Pas vertical : ${v} cm`, (d) => {
            if (linked) d.grid.step = v
            else d.grid.stepY = v
          })} />
      </div>
      <StepSuggestions />
      <p
        className="hint grid-summary"
        data-testid="grid-summary"
        title={`${layout.cols} colonnes × ${layout.rows} lignes${restW ? ` · dernière colonne ${round(restW)} cm` : ''}${restH ? ` · dernière ligne ${round(restH)} cm` : ''}`}
      >
        {layout.cols} × {layout.rows} cases
        {restW || restH ? ' + ' : null}
        {restW ? <span>↔ {round(restW)} cm</span> : null}
        {restW && restH ? ' et ' : null}
        {restH ? <span>↕ {round(restH)} cm</span> : null}
      </p>
    </Section>
  )
}

/** Sous le pas : valeurs proches qui donnent un nombre entier de colonnes / lignes (à titre indicatif). */
function StepSuggestions() {
  const wall = useEditor((s) => s.doc.wall)
  const grid = useEditor((s) => s.doc.grid)
  const step = grid.step
  const sy = stepYOf(grid)
  const linked = grid.stepY === undefined
  const commit = useEditor((s) => s.commit)
  const cols = stepSuggestions(wall.w, step)
  const rows = stepSuggestions(wall.h, sy)
  const both = linked ? commonStepSuggestions(wall.w, wall.h, step) : { below: null, above: null }
  if (!cols.below && !cols.above && !rows.below && !rows.above) return null
  const chip = (v: { step: number; count: number } | null, unit: string, axis: 'x' | 'y' | 'both' = 'x') =>
    v && (
      <button key={`${unit}${v.step}`} className="step-chip" data-testid="step-chip" title={`Appliquer un pas de ${v.step} cm`}
        onClick={() => commit(`Pas de grille : ${v.step} cm`, (d) => {
          if (axis === 'y' && !linked) d.grid.stepY = v.step
          else if (axis === 'x' && !linked) d.grid.step = v.step
          else { d.grid.step = v.step; delete d.grid.stepY }
        })}>
        {fmt(v.step)} cm <em>{v.count} {unit}</em>
      </button>
    )
  return (
    <div className="step-suggestions" data-testid="step-suggestions">
      {(cols.below || cols.above) && (
        <div><span>Colonnes entières</span>{chip(cols.below, 'col.', 'x')}{chip(cols.above, 'col.', 'x')}</div>
      )}
      {(rows.below || rows.above) && (
        <div><span>Lignes entières</span>{chip(rows.below, 'lignes', 'y')}{chip(rows.above, 'lignes', 'y')}</div>
      )}
      {(both.below || both.above) && (
        <div><span>Les deux</span>
          {both.below && chip({ step: both.below, count: wall.w / both.below }, 'col.', 'both')}
          {both.above && chip({ step: both.above, count: wall.w / both.above }, 'col.', 'both')}
        </div>
      )}
    </div>
  )
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const round = (n: number) => Math.round(n * 10) / 10
