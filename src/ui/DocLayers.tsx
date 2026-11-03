import type { DocState } from '../model/types'
import type { Mode } from '../store/editor'
import { shapeToD } from '../geometry/shapes'

export function DocLayers({ doc, mode }: { doc: DocState; mode: Mode }) {
  return (
    <g className="doc-layers">
      {mode !== 'render' && (
        <g className="shapes" data-testid="shapes">
          {doc.shapes.map((s) => (
            <path key={s.id} d={shapeToD(s)} className="shape" data-shape-id={s.id} />
          ))}
        </g>
      )}
    </g>
  )
}
