import { useEditor } from '../store/editor'
import { measureText } from '../tools/measure'
import { toGridCoords } from '../geometry/grid'
import { fmtLen } from '../tools/common'
import { Icon } from './icons'

const fmt = (n: number) => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/** Footer affiché pendant l'utilisation de l'outil mesure. */
export function MeasureBar() {
  const tool = useEditor((s) => s.tool)
  const m = useEditor((s) => s.measure)
  const doc = useEditor((s) => s.doc)
  if (tool !== 'measure') return null
  if (!m) {
    return (
      <footer className="measure-bar" data-testid="measure-bar">
        <Icon name="measure" size={16} />
        <span className="muted">Clic sur un premier point, puis sur un second. Shift : à l’horizontale, à la verticale ou à 45°.</span>
      </footer>
    )
  }
  const t = measureText(m.a, m.b)
  const A = toGridCoords(doc.wall, doc.grid, m.a)
  const B = toGridCoords(doc.wall, doc.grid, m.b)
  const dx = Math.abs(m.b.x - m.a.x)
  const dy = Math.abs(m.b.y - m.a.y)
  return (
    <footer className="measure-bar" data-testid="measure-bar">
      <Icon name="measure" size={16} />
      <span className="m-main" data-testid="measure-distance">{t.main}</span>
      <span className="m-item" data-testid="measure-detail">
        <em>Horizontal</em> {fmtLen(dx)}
        <em>Vertical</em> {fmtLen(dy)}
        <em>Angle</em> {t.detail.split(' · ').at(-1)}
      </span>
      <span className="m-item muted">
        A ({fmt(A.x)} ; {fmt(A.y)}) → B ({fmt(B.x)} ; {fmt(B.y)}) cm
      </span>
      {!m.fixed && <span className="m-item muted">clic pour fixer</span>}
    </footer>
  )
}
