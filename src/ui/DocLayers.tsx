import type { DocState } from '../model/types'
import { useEditor, type Mode } from '../store/editor'
import { shapeToD } from '../geometry/shapes'

export function DocLayers({ doc, mode }: { doc: DocState; mode: Mode }) {
  const overrides = useEditor((s) => s.overrides)
  return (
    <g className="doc-layers">
      {mode !== 'render' && (
        <g className="shapes" data-testid="shapes">
          {doc.shapes.map((s) => (
            <path key={s.id} d={shapeToD(overrides?.[s.id] ?? s)} className="shape" data-shape-id={s.id} />
          ))}
        </g>
      )}
    </g>
  )
}
