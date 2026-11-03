import type { DocState } from '../model/types'
import { useEditor, type Mode } from '../store/editor'
import { shapeToD } from '../geometry/shapes'
import { resolveFills } from '../store/fills'

export function FillsLayer({ doc }: { doc: DocState }) {
  const fills = resolveFills(doc)
  return (
    <g className="fills" data-testid="fills">
      {fills.map((f) => (
        <path key={f.fill.id} d={f.region.d} fill={f.hex} stroke={f.hex} className="fill" data-color-id={f.fill.colorId} data-area={Math.round(f.region.area)} />
      ))}
    </g>
  )
}

export function ShapesLayer({ doc, className = 'shapes' }: { doc: DocState; className?: string }) {
  const overrides = useEditor((s) => s.overrides)
  return (
    <g className={className} data-testid="shapes">
      {doc.shapes.map((s) => (
        <path key={s.id} d={shapeToD(overrides?.[s.id] ?? s)} className="shape" data-shape-id={s.id} />
      ))}
    </g>
  )
}

export function DocLayers({ doc, mode }: { doc: DocState; mode: Mode }) {
  return (
    <g className="doc-layers">
      <FillsLayer doc={doc} />
      {mode !== 'render' && <ShapesLayer doc={doc} />}
    </g>
  )
}
