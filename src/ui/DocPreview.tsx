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
  margin = 0,
}: {
  doc: DocState
  showGrid?: boolean
  showLines?: boolean
  showLabels?: boolean
  className?: string
  lineWidth?: number
  /** Marge autour du mur, en fraction de son plus grand côté (évite de rogner le contour). */
  margin?: number
}) {
  const fills = resolveFills(doc)
  const uid = useId().replace(/:/g, '')
  const pad = Math.max(doc.wall.w, doc.wall.h) * (showLabels ? 0.06 : margin)
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

/** Vignette : cadre aux proportions fixes, le mur y est toujours entièrement contenu et centré. */
export function Thumb({ doc, onOpen, label, ratio = '4 / 3', children }: { doc: DocState; onOpen?: () => void; label?: string; ratio?: string; children?: React.ReactNode }) {
  return (
    <div
      className={`thumb-frame${onOpen ? ' clickable' : ''}`}
      style={{ aspectRatio: ratio }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(e) => onOpen && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
    >
      <DocPreview doc={doc} showGrid={false} className="thumb-svg" margin={0.015} />
      {children}
    </div>
  )
}
