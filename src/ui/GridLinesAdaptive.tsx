import { useMemo } from 'react'
import type { DocState, GridLineStyle } from '../model/types'
import { dashArray, gridLayout, gridStrokeFor } from '../geometry/grid'
import { resolveFills } from '../store/fills'

/**
 * Lignes de grille dont la couleur s'adapte à chaque aplat : on redessine la grille
 * découpée sur chaque zone peinte avec une couleur contrastée.
 * Même trait en Édition et en Consultation.
 */
export function GridLinesAdaptive({ doc, idPrefix = 'g', style }: { doc: DocState; idPrefix?: string; style?: { lineWidth: number; lineOpacity: number; lineStyle?: GridLineStyle } | null }) {
  const layout = useMemo(() => gridLayout(doc.wall, doc.grid), [doc.wall, doc.grid])
  const gw = style?.lineWidth ?? doc.grid.lineWidth ?? 1
  const go = style?.lineOpacity ?? doc.grid.lineOpacity ?? 1
  const ls = style?.lineStyle ?? doc.grid.lineStyle ?? 'dashed'
  const gd = dashArray(ls, gw) ?? 'none'
  const fills = resolveFills(doc)
  if (!doc.grid.show) return null
  const lines = (
    <>
      {layout.vLines.map((l, i) => <line key={`v${i}`} x1={l.pos} x2={l.pos} y1={0} y2={doc.wall.h} />)}
      {layout.hLines.map((l, i) => <line key={`h${i}`} x1={0} x2={doc.wall.w} y1={l.pos} y2={l.pos} />)}
    </>
  )
  return (
    <g className="grid-lines" data-testid="grid-lines" opacity={go} data-line-style={ls} style={{ ['--gw' as string]: gw, ['--gd' as string]: gd }}>
      <defs>
        {fills.map((f) => (
          <clipPath key={f.fill.id} id={`${idPrefix}-clip-${f.fill.id}`}>
            <path d={f.region.d} />
          </clipPath>
        ))}
      </defs>
      <g stroke={gridStrokeFor(doc.background.hex)} data-grid-on="background">{lines}</g>
      {fills.map((f) => (
        <g key={f.fill.id} clipPath={`url(#${idPrefix}-clip-${f.fill.id})`}>
          <g stroke={f.hex} className="grid-cover">{lines}</g>
          <g stroke={gridStrokeFor(f.hex)} data-grid-on={f.fill.colorId}>{lines}</g>
        </g>
      ))}
    </g>
  )
}
