import { useEditor } from '../store/editor'
import { gridLayout } from '../geometry/grid'
import { neighborCell, togglePrintCell, zoomToCell } from '../tools/consult'
import { BackgroundSection, PaletteSection } from './PaintSections'
import { Section } from './SidePanel'
import { NumberField } from './fields'

export function ConsultPanel({ onExport }: { onExport: () => void }) {
  const doc = useEditor((s) => s.doc)
  const cell = useEditor((s) => s.consultCell)
  const pickPrint = useEditor((s) => s.pickPrint)
  const setPickPrint = useEditor((s) => s.setPickPrint)
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const setSettings = useEditor((s) => s.setSettings)
  const L = gridLayout(doc.wall, doc.grid)
  const c = cell ? L.cells.find((x) => x.id === cell) : null
  const nav = (k: string) => {
    if (!cell) return zoomToCell(L.cells[0]?.id ?? null)
    const n = neighborCell(cell, k)
    if (n) zoomToCell(n)
  }
  return (
    <div className="consult-panel">
      <Section title="Consultation" testId="consult-panel">
        <p className="big-id" data-testid="consult-cell">{c ? c.id : 'Vue d’ensemble'}</p>
        {c && <p className="hint" style={{ textAlign: 'center', margin: 0 }}>{Math.round(c.w * 10) / 10} × {Math.round(c.h * 10) / 10} cm</p>}
        <NumberField label="Sous-grille de la vue détail" suffix="cm" min={1} max={500} value={doc.grid.subStep ?? 10} testId="sub-step"
          onCommit={(v) => setSettings((d) => { d.grid.subStep = v })} />
        <div className="cell-nav">
          <span />
          <button onClick={() => nav('ArrowUp')} title="Case au-dessus">↑</button>
          <span />
          <button onClick={() => nav('ArrowLeft')} title="Case à gauche">←</button>
          <button onClick={() => zoomToCell(null)} title="Vue d’ensemble (Échap)" data-testid="consult-overview">⤢</button>
          <button onClick={() => nav('ArrowRight')} title="Case à droite">→</button>
          <span />
          <button onClick={() => nav('ArrowDown')} title="Case en dessous">↓</button>
          <span />
        </div>
        <p className="hint" style={{ margin: 0 }}>Clic sur une case pour zoomer, nouveau clic pour revenir à la vue d’ensemble. Flèches du clavier : case voisine.</p>
        <label className="check">
          <input type="checkbox" checked={tool === 'measure'} onChange={(e) => { setTool(e.target.checked ? 'measure' : 'select'); if (e.target.checked) setPickPrint(false) }} data-testid="consult-measure" />
          Outil mesure
        </label>
      </Section>
      <Section title="Cases à imprimer en grand" testId="print-section">
        <label className="check">
          <input type="checkbox" checked={pickPrint} onChange={(e) => { setPickPrint(e.target.checked); if (e.target.checked) setTool('select') }} data-testid="pick-print" />
          Choisir en cliquant sur la grille
        </label>
        <p className="hint" style={{ margin: 0 }}>Sans cocher : ⌥ + clic sur une case pour l’ajouter ou la retirer.</p>
        {c && (
          <button onClick={() => togglePrintCell(c.id)} data-testid="toggle-current-print">
            {doc.printCells.includes(c.id) ? `Retirer ${c.id} de l’impression` : `Imprimer ${c.id} en grand`}
          </button>
        )}
        <div className="cell-chips" data-testid="print-cells">
          {doc.printCells.length === 0 && <span className="muted small">Aucune case choisie : le PDF n’aura que la vue d’ensemble.</span>}
          {doc.printCells.map((id) => (
            <button key={id} className="cell-chip" onClick={() => zoomToCell(id)} title="Voir la case">{id}</button>
          ))}
        </div>
        {doc.printCells.length > 0 && (
          <button className="ghost small" onClick={() => setSettings((d) => { d.printCells = [] })}>Tout retirer</button>
        )}
        <button className="primary" onClick={onExport} data-testid="open-export">Exporter le PDF chantier…</button>
      </Section>
      <PaletteSection />
      <BackgroundSection />
    </div>
  )
}
