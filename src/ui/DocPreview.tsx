import type { DocState } from '../model/types'
import { shapeToD } from '../geometry/shapes'
import { resolveFills } from '../store/fills'
import { useId } from 'react'
import { GridLinesAdaptive } from './GridLinesAdaptive'

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
  const uid = useId().replace(/:/g, '')
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
      {showGrid && <g className="preview-grid"><GridLinesAdaptive doc={doc} idPrefix={`pv${uid}`} /></g>}
      <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} fill="none" stroke="#1d1f22" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
