import { useMemo } from 'react'
import type { DocState } from '../model/types'
import { gridLayout, gridStrokeFor } from '../geometry/grid'
import { resolveFills } from '../store/fills'

/**
 * Lignes de grille dont la couleur s'adapte à chaque aplat : on redessine la grille
 * découpée sur chaque zone peinte avec une couleur contrastée.
 */
export function GridLinesAdaptive({ doc, strong, idPrefix = 'g', style }: { doc: DocState; strong?: boolean; idPrefix?: string; style?: { lineWidth: number; lineOpacity: number } | null }) {
  const layout = useMemo(() => gridLayout(doc.wall, doc.grid), [doc.wall, doc.grid])
  const gw = style?.lineWidth ?? doc.grid.lineWidth ?? 1
  const go = style?.lineOpacity ?? doc.grid.lineOpacity ?? 1
  const fills = resolveFills(doc)
  if (!doc.grid.show) return null
  const lines = (
    <>
      {layout.vLines.map((l, i) => <line key={`v${i}`} x1={l.pos} x2={l.pos} y1={0} y2={doc.wall.h} />)}
      {layout.hLines.map((l, i) => <line key={`h${i}`} x1={0} x2={doc.wall.w} y1={l.pos} y2={l.pos} />)}
    </>
  )
  return (
    <g className={`grid-lines${strong ? ' strong' : ''}`} data-testid="grid-lines" opacity={go} style={{ ['--gw' as string]: gw }}>
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
