import { useEditor } from '../store/editor'
import { dist } from '../geometry/vec'
import { fmtLen } from '../tools/common'
import { Icon } from './icons'

/** Pastille de mesure, posée à gauche des contrôles de zoom. */
export function MeasureBar() {
  const tool = useEditor((s) => s.tool)
  const m = useEditor((s) => s.measure)
  if (tool !== 'measure') return null
  if (!m) {
    return (
      <div className="hud-pill measure-pill" data-testid="measure-bar" title="Clic sur deux points pour mesurer · Shift : horizontal, vertical ou 45°">
        <Icon name="measure" size={16} />
        <span className="muted">2 clics</span>
      </div>
    )
  }
  const dx = Math.abs(m.b.x - m.a.x)
  const dy = Math.abs(m.b.y - m.a.y)
  let ang = (Math.atan2(-(m.b.y - m.a.y), m.b.x - m.a.x) * 180) / Math.PI
  if (ang < 0) ang += 360
  return (
    <div className="hud-pill measure-pill" data-testid="measure-bar">
      <span className="hud-item strong" title="Distance"><Icon name="measure" size={16} /><b data-testid="measure-distance">{fmtLen(dist(m.a, m.b))}</b></span>
      <span className="hud-sep" />
      <span className="hud-item" title="Écart horizontal" data-testid="measure-dx"><Icon name="width" size={16} />{fmtLen(dx)}</span>
      <span className="hud-item" title="Écart vertical" data-testid="measure-dy"><Icon name="height" size={16} />{fmtLen(dy)}</span>
      <span className="hud-item" title="Angle" data-testid="measure-angle"><Icon name="angle" size={16} />{Math.round(ang * 10) / 10}°</span>
    </div>
  )
}
