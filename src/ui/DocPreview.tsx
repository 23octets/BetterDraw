import type { DocState } from '../model/types'
import { shapeToD } from '../geometry/shapes'
import { resolveFills } from '../store/fills'
import { gridLayout } from '../geometry/grid'

/** Rendu statique d'un dessin (vignettes, comparaison, exports). */
export function DocPreview({
  doc,
  showGrid = true,
  showLines = true,
  showLabels = false,
  className,
  lineWidth = 1.2,
}: {
  doc: DocState
  showGrid?: boolean
  showLines?: boolean
  showLabels?: boolean
  className?: string
  lineWidth?: number
}) {
  const fills = resolveFills(doc)
  const layout = gridLayout(doc.wall, doc.grid)
  const pad = showLabels ? Math.max(doc.wall.w, doc.wall.h) * 0.06 : 0
  return (
    <svg
      className={className}
      viewBox={`${-pad} ${-pad} ${doc.wall.w + pad * 2} ${doc.wall.h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} fill={doc.background.hex} />
      {fills.map((f) => (
        <path key={f.fill.id} d={f.region.d} fill={f.hex} stroke={f.hex} strokeWidth={0.3} />
      ))}
      {showLines &&
        doc.shapes.map((s) => (
          <path key={s.id} d={shapeToD(s)} fill="none" stroke="#1d1f22" strokeWidth={lineWidth} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      {showGrid && doc.grid.show && (
        <g stroke="#c8643b" strokeOpacity={0.6} strokeWidth={0.8} vectorEffect="non-scaling-stroke" strokeDasharray="3 2">
          {layout.vLines.map((l, i) => (
            <line key={`v${i}`} x1={l.pos} x2={l.pos} y1={0} y2={doc.wall.h} vectorEffect="non-scaling-stroke" />
          ))}
          {layout.hLines.map((l, i) => (
            <line key={`h${i}`} x1={0} x2={doc.wall.w} y1={l.pos} y2={l.pos} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      )}
      <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} fill="none" stroke="#1d1f22" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
