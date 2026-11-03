import { useMemo } from 'react'
import type { DocState } from '../model/types'
import { gridLayout } from '../geometry/grid'
import type { View } from '../store/editor'

/** Lignes de grille (en coordonnées monde, trait non mis à l'échelle). */
export function GridLines({ doc, strong }: { doc: DocState; strong?: boolean }) {
  const layout = useMemo(() => gridLayout(doc.wall, doc.grid), [doc.wall, doc.grid])
  if (!doc.grid.show) return null
  return (
    <g className={`grid-lines${strong ? ' strong' : ''}`} data-testid="grid-lines">
      {layout.vLines.map((l, i) => (
        <line key={`v${i}`} x1={l.pos} x2={l.pos} y1={0} y2={doc.wall.h} />
      ))}
      {layout.hLines.map((l, i) => (
        <line key={`h${i}`} x1={0} x2={doc.wall.w} y1={l.pos} y2={l.pos} />
      ))}
    </g>
  )
}

/** Repères (A, B… / 1, 2…) et cotes, dessinés en coordonnées écran. */
export function GridLabels({ doc, view }: { doc: DocState; view: View }) {
  const layout = useMemo(() => gridLayout(doc.wall, doc.grid), [doc.wall, doc.grid])
  if (!doc.grid.show) return null
  const sx = (x: number) => x * view.zoom + view.panX
  const sy = (y: number) => y * view.zoom + view.panY
  const top = sy(0)
  const bottom = sy(doc.wall.h)
  const left = sx(0)
  const right = sx(doc.wall.w)
  const colCells = layout.cells.filter((c) => c.row === 0)
  const rowCells = layout.cells.filter((c) => c.col === 0)
  const minLabelGap = 26
  const showCoteV = layout.vLines.length < 2 || Math.abs(sx(layout.vLines[1].pos) - sx(layout.vLines[0].pos)) > minLabelGap
  const showCoteH = layout.hLines.length < 2 || Math.abs(sy(layout.hLines[1].pos) - sy(layout.hLines[0].pos)) > 14
  return (
    <g className="grid-labels" data-testid="grid-labels">
      {colCells.map((c) => (
        <text key={`c${c.col}`} x={sx(c.x + c.w / 2)} y={top - 10} className="grid-label" textAnchor="middle">
          {c.id.replace(/\d+$/, '')}
        </text>
      ))}
      {rowCells.map((c) => (
        <text key={`r${c.row}`} x={left - 10} y={sy(c.y + c.h / 2) + 4} className="grid-label" textAnchor="end">
          {c.row + 1}
        </text>
      ))}
      {showCoteV &&
        layout.vLines.map((l, i) => (
          <g key={`cv${i}`}>
            <line x1={sx(l.pos)} x2={sx(l.pos)} y1={bottom + 2} y2={bottom + 8} className="cote-tick" />
            <text x={sx(l.pos)} y={bottom + 20} className="cote" textAnchor="middle">
              {fmt(l.cote)}
            </text>
          </g>
        ))}
      {showCoteH &&
        layout.hLines.map((l, i) => (
          <g key={`ch${i}`}>
            <line x1={right + 2} x2={right + 8} y1={sy(l.pos)} y2={sy(l.pos)} className="cote-tick" />
            <text x={right + 11} y={sy(l.pos) + 4} className="cote" textAnchor="start">
              {fmt(l.cote)}
            </text>
          </g>
        ))}
    </g>
  )
}

function fmt(n: number) {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}
