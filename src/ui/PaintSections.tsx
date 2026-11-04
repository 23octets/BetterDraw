import { useState } from 'react'
import { nanoid } from 'nanoid'
import { useEditor } from '../store/editor'
import { surfaces } from '../store/fills'
import { Section } from './SidePanel'
import { NumberField, TextField } from './fields'
import { Icon } from './icons'
import { ColorPicker } from './ColorPicker'

const m2 = (cm2: number) => (cm2 / 10000).toFixed(2)
const L = (l: number) => (l < 10 ? l.toFixed(2) : l.toFixed(1))

export function PaletteSection() {
  const palette = useEditor((s) => s.doc.palette)
  const fills = useEditor((s) => s.doc.fills)
  const active = useEditor((s) => s.activeColorId)
  const setActive = useEditor((s) => s.setActiveColor)
  const setTool = useEditor((s) => s.setTool)
  const commit = useEditor((s) => s.commit)
  // en consultation, on ajuste les teintes sur le rendu : il n'y a rien à peindre
  const canPaint = useEditor((s) => s.mode === 'edit')
  const [picker, setPicker] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const pick = (id: string) => {
    setActive(id)
    setTool('fill')
  }
  const pickerColor = picker ? palette.find((p) => p.id === picker.id) : null
  return (
    <Section title="Palette" testId="palette-section">
      <div className="palette">
        {palette.map((c) => (
          <div
            key={c.id}
            className={`swatch-row${canPaint && active === c.id ? ' on' : ''}${canPaint ? '' : ' no-paint'}`}
            data-testid={`swatch-${c.name}`}
            onClick={() => canPaint && renaming !== c.id && pick(c.id)}
            title={canPaint ? `Peindre avec ${c.name}` : undefined}
          >
            <button
              className="swatch"
              style={{ background: c.hex }}
              title="Modifier la teinte"
              aria-label={`Modifier la teinte de ${c.name}`}
              data-testid="color-input"
              onClick={(e) => {
                e.stopPropagation()
                setPicker(picker?.id === c.id ? null : { id: c.id, anchor: e.currentTarget })
              }}
            />
            {renaming === c.id ? (
              <span onClick={(e) => e.stopPropagation()} className="name-edit">
                <TextField className="name" value={c.name} testId="rename-input" autoFocus onDone={() => setRenaming(null)} onCommit={(name) => {
                  commit('Renommer une couleur', (d) => {
                    const x = d.palette.find((p) => p.id === c.id)
                    if (x) x.name = name
                  })
                  setRenaming(null)
                }} />
              </span>
            ) : (
              <span className="swatch-name">{c.name}</span>
            )}
            <button
              className="icon-btn ghost small row-tool"
              title="Renommer"
              aria-label={`Renommer ${c.name}`}
              data-testid="rename-color"
              onClick={(e) => {
                e.stopPropagation()
                setRenaming(c.id)
              }}
            >
              <Icon name="pencil" size={14} />
            </button>
            <button
              className="icon-btn ghost small row-tool"
              title="Supprimer la couleur"
              aria-label={`Supprimer ${c.name}`}
              onClick={(e) => {
                e.stopPropagation()
                const used = fills.filter((f) => f.colorId === c.id).length
                if (used && !confirm(`« ${c.name} » est utilisée par ${used} zone(s). Les dépeindre et supprimer la couleur ?`)) return
                commit(`Supprimer la couleur ${c.name}`, (d) => {
                  d.palette = d.palette.filter((p) => p.id !== c.id)
                  d.fills = d.fills.filter((f) => f.colorId !== c.id)
                })
                if (active === c.id) setActive(palette.find((p) => p.id !== c.id)?.id ?? null)
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
      {picker && pickerColor && (
        <ColorPicker
          value={pickerColor.hex}
          anchor={picker.anchor}
          onPreview={(hex) => useEditor.setState({ palettePreview: hex ? { id: pickerColor.id, hex } : null })}
          onChange={(hex) => commit(`Teinte de ${pickerColor.name}`, (d) => {
            const x = d.palette.find((p) => p.id === pickerColor.id)
            if (x) x.hex = hex
          })}
          onClose={() => setPicker(null)}
        />
      )}
      <button
        className="wide"
        data-testid="add-color"
        onClick={() => {
          const id = nanoid(8)
          commit('Ajouter une couleur', (d) => {
            d.palette.push({ id, name: `Couleur ${d.palette.length + 1}`, hex: '#7a8ba0' })
          })
          setActive(id)
        }}
      >
        <Icon name="plus" size={14} /> Ajouter une couleur
      </button>
    </Section>
  )
}

export function BackgroundSection() {
  const doc = useEditor((s) => s.doc)
  const [open, setOpen] = useState(false)
  const room = useEditor((s) => s.room)
  const s = surfaces(doc, room)
  const totalL = s.colors.reduce((a, c) => a + c.liters, 0)
  return (
    <Section title="Peinture" testId="surfaces-section">
      <button className="wide" onClick={() => setOpen(true)} data-testid="open-estimate">
        <Icon name="drop" size={15} /> Estimer la peinture{s.colors.length ? ` · ${L(totalL)} L` : ''}
      </button>
      {open && <EstimateModal onClose={() => setOpen(false)} />}
    </Section>
  )
}

export function EstimateModal({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc)
  const commit = useEditor((s) => s.commit)
  const room = useEditor((s) => s.room)
  const s = surfaces(doc, room)
  const totalA = s.colors.reduce((a, c) => a + c.area, 0)
  const totalL = s.colors.reduce((a, c) => a + c.liters, 0)
  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="modal modal-small" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Estimation de la peinture" data-testid="estimate-modal">
        <header className="modal-head">
          <strong>Estimation de la peinture</strong>
          <div className="spacer" />
          <button className="icon-btn ghost" onClick={onClose} aria-label="Fermer" data-testid="close-estimate"><Icon name="close" /></button>
        </header>
        <div className="modal-pad">
          <div className="row">
            <NumberField label="Rendement" suffix="m²/L" min={1} max={50} value={doc.paint.coverage}
              onCommit={(v) => commit(`Rendement : ${v} m²/L`, (d) => { d.paint.coverage = v })} />
            <NumberField label="Couches" min={1} max={5} value={doc.paint.coats}
              onCommit={(v) => commit(`Couches : ${v}`, (d) => { d.paint.coats = Math.round(v) })} />
          </div>
          <table className="surf-table" data-testid="surfaces-table">
            <thead>
              <tr><th>Couleur</th><th className="num">Surface</th><th className="num">Peinture</th></tr>
            </thead>
            <tbody>
              {s.colors.map((c) => (
                <tr key={c.colorId} data-testid="surface-row">
                  <td><span className="dot" style={{ background: c.hex }} />{c.name}</td>
                  <td className="num">{m2(c.area)} m²</td>
                  <td className="num">{L(c.liters)} L</td>
                </tr>
              ))}
              <tr className="muted" data-testid="surface-background">
                <td><span className="dot" style={{ background: doc.background.hex }} />Non peint</td>
                <td className="num">{m2(s.background.area)} m²</td>
                <td className="num">—</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>Total à peindre</td>
                <td className="num" data-testid="surface-total">{m2(totalA)} m²</td>
                <td className="num">{L(totalL)} L</td>
              </tr>
            </tfoot>
          </table>
          <label className="check">
            <input type="checkbox" checked={doc.paint.showLiters} onChange={(e) => commit('Litres dans le PDF', (d) => { d.paint.showLiters = e.target.checked })} />
            Afficher les litres dans le PDF chantier
          </label>
          {room && (room.openings.length > 0 || !!room.masks?.length) && <p className="hint">Ouvertures et zones sans mur déduites.</p>}
          <p className="hint">Estimation indicative : litres = surface × couches ÷ rendement. Prévois une marge de 10 %.</p>
        </div>
      </div>
    </div>
  )
}
