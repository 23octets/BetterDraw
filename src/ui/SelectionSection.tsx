import { useState } from 'react'
import { useEditor } from '../store/editor'
import type { Shape } from '../model/types'
import { mirrorMat, rotateMat, scaleMat, type Mat } from '../geometry/vec'
import { selectionCenter, toggleClosed } from '../geometry/edit'
import { shapeLength, transformShape } from '../geometry/shapes'
import { deleteSelection, duplicateSelection } from '../tools/select'
import { Section } from './SidePanel'
import { setPendingCarry } from '../store/fills'
import { fmtLen } from '../tools/common'

export function transformSelection(label: string, make: (center: { x: number; y: number }) => Mat) {
  const st = useEditor.getState()
  const ids = new Set(st.selection)
  const shapes = st.doc.shapes.filter((s) => ids.has(s.id))
  if (!shapes.length) return
  const m = make(selectionCenter(shapes))
  setPendingCarry({ ids, m })
  st.commit(label, (d) => {
    d.shapes = d.shapes.map((s) => (ids.has(s.id) ? transformShape(s as Shape, m) : s)) as typeof d.shapes
  })
}

export function SelectionSection() {
  const selection = useEditor((s) => s.selection)
  const shapes = useEditor((s) => s.doc.shapes)
  const commit = useEditor((s) => s.commit)
  const [angle, setAngle] = useState('15')
  const [scale, setScale] = useState('110')
  const sel = shapes.filter((s) => selection.includes(s.id))
  if (!sel.length) return null
  const single = sel.length === 1 ? sel[0] : null
  const total = sel.reduce((a, s) => a + shapeLength(s), 0)
  const rad = (deg: number) => (deg * Math.PI) / 180
  return (
    <Section title={`Sélection (${sel.length})`} testId="selection-section">
      <p className="hint" style={{ margin: 0 }}>Longueur totale : {fmtLen(total)}</p>
      <div className="btn-grid">
        <button data-testid="mirror-h" onClick={() => transformSelection('Symétrie horizontale', (c) => mirrorMat('h', c))}>⇋ Miroir H</button>
        <button data-testid="mirror-v" onClick={() => transformSelection('Symétrie verticale', (c) => mirrorMat('v', c))}>⇵ Miroir V</button>
        <button data-testid="duplicate" onClick={() => duplicateSelection()}>⧉ Dupliquer</button>
        <button data-testid="rotate-90" onClick={() => transformSelection('Rotation 90°', (c) => rotateMat(rad(-90), c))}>⟲ 90°</button>
        <button data-testid="rotate-neg-90" onClick={() => transformSelection('Rotation -90°', (c) => rotateMat(rad(90), c))}>⟳ 90°</button>
        <button className="danger" data-testid="delete" onClick={() => deleteSelection()}>Supprimer</button>
      </div>
      <div className="row inline-action">
        <label className="field">
          <span>Rotation (°)</span>
          <input data-testid="rotate-angle" value={angle} onChange={(e) => setAngle(e.target.value)} />
        </label>
        <button data-testid="rotate-apply" onClick={() => {
          const a = parseFloat(angle.replace(',', '.'))
          if (Number.isFinite(a)) transformSelection(`Rotation ${a}°`, (c) => rotateMat(rad(-a), c))
        }}>Tourner</button>
      </div>
      <div className="row inline-action">
        <label className="field">
          <span>Échelle (%)</span>
          <input data-testid="scale-pct" value={scale} onChange={(e) => setScale(e.target.value)} />
        </label>
        <button data-testid="scale-apply" onClick={() => {
          const k = parseFloat(scale.replace(',', '.')) / 100
          if (Number.isFinite(k) && k > 0) transformSelection(`Échelle ${Math.round(k * 100)} %`, (c) => scaleMat(k, c))
        }}>Appliquer</button>
      </div>
      {single && single.pts.length >= 3 && (
        <button data-testid="toggle-closed" onClick={() => commit(single.closed ? 'Ouvrir la forme' : 'Fermer la forme', (d) => {
          const i = d.shapes.findIndex((s) => s.id === single.id)
          d.shapes[i] = toggleClosed(single)
        })}>
          {single.closed ? 'Ouvrir la forme' : 'Fermer la forme'}
        </button>
      )}
      <p className="hint" style={{ margin: 0 }}>
        Survole un trait pour voir ses points. Carré : déplacer le point · rond : courber le segment en arc de cercle (droit ou Bézier) · losange : courbe de Bézier · double-clic sur un rond : redresser
      </p>
    </Section>
  )
}
