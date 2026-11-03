import { useEditor } from '../store/editor'
import { NumberField } from './fields'
import type { GridOrigin } from '../model/types'
import { gridLayout } from '../geometry/grid'

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

const ORIGINS: { id: GridOrigin; label: string }[] = [
  { id: 'tl', label: '↖' },
  { id: 'tr', label: '↗' },
  { id: 'bl', label: '↙' },
  { id: 'br', label: '↘' },
]

export function GridSection() {
  const doc = useEditor((s) => s.doc)
  const commit = useEditor((s) => s.commit)
  const g = doc.grid
  const layout = gridLayout(doc.wall, g)
  const lastW = layout.vLines.length > 1 ? Math.abs(layout.vLines.at(-1)!.cote - layout.vLines.at(-2)!.cote) : 0
  const lastH = layout.hLines.length > 1 ? Math.abs(layout.hLines.at(-1)!.cote - layout.hLines.at(-2)!.cote) : 0
  return (
    <Section title="Grille de carroyage" testId="grid-section">
      <div className="row">
        <NumberField label="Pas" suffix="cm" min={1} max={1000} value={g.step} testId="grid-step"
          onCommit={(step) => commit(`Pas de grille : ${step} cm`, (d) => { d.grid.step = step })} />
        <NumberField label="Aimantage" suffix="cm" min={0.5} max={100} value={g.snapStep} testId="snap-step"
          onCommit={(v) => commit(`Aimantage : ${v} cm`, (d) => { d.grid.snapStep = v })} />
      </div>
      <div className="field">
        <span>Origine (cotes et repères)</span>
        <div className="origin-picker" role="radiogroup">
          {ORIGINS.map((o) => (
            <button key={o.id} className={g.origin === o.id ? 'on' : ''} aria-pressed={g.origin === o.id}
              data-testid={`origin-${o.id}`}
              onClick={() => commit('Origine de la grille', (d) => { d.grid.origin = o.id })}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={g.show} onChange={(e) => commit(e.target.checked ? 'Afficher la grille' : 'Masquer la grille', (d) => { d.grid.show = e.target.checked })} />
        Afficher la grille
      </label>
      <p className="hint" data-testid="grid-summary">
        {layout.cols} × {layout.rows} cases
        {lastW && lastW !== g.step ? ` · dernière colonne ${round(lastW)} cm` : ''}
        {lastH && lastH !== g.step ? ` · dernière ligne ${round(lastH)} cm` : ''}
      </p>
    </Section>
  )
}

const round = (n: number) => Math.round(n * 10) / 10
