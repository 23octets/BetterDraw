import { useEffect } from 'react'
import { useEditor } from '../store/editor'
import { cellAt, gridLayout } from '../geometry/grid'
import type { ToolHandlers } from './useActiveTool'
import { toScreen } from './common'

export function zoomToCell(id: string | null) {
  const st = useEditor.getState()
  st.setConsultCell(id)
  if (!id) {
    window.dispatchEvent(new CustomEvent('bd:fit', { detail: null }))
    return
  }
  const c = gridLayout(st.doc.wall, st.doc.grid).cells.find((c) => c.id === id)
  if (c) window.dispatchEvent(new CustomEvent('bd:fit', { detail: { x: c.x, y: c.y, w: c.w, h: c.h } }))
}

export function togglePrintCell(id: string) {
  const st = useEditor.getState()
  const on = st.doc.printCells.includes(id)
  st.commit(on ? `Retirer la case ${id} de l'impression` : `Imprimer la case ${id}`, (d) => {
    d.printCells = on ? d.printCells.filter((x) => x !== id) : [...d.printCells, id]
  })
}

/** Cases voisines (flèches) dans le repère affiché : ← → colonnes, ↑ ↓ lignes « vers le haut du mur ». */
export function neighborCell(id: string, key: string): string | null {
  const st = useEditor.getState()
  const L = gridLayout(st.doc.wall, st.doc.grid)
  const c = L.cells.find((x) => x.id === id)
  if (!c) return null
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key]
  if (!d) return null
  const target = { x: cx + d[0] * (c.w / 2 + 0.5), y: cy + d[1] * (c.h / 2 + 0.5) }
  const n = cellAt(L, target)
  return n && n.id !== id ? n.id : null
}

export function useConsultTool(active: boolean): ToolHandlers {
  const doc = useEditor((s) => s.doc)
  const consultCell = useEditor((s) => s.consultCell)
  const pickPrint = useEditor((s) => s.pickPrint)
  useEditor((s) => s.view)

  useEffect(() => {
    if (!active) return
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const st = useEditor.getState()
      if (e.key === 'Escape') {
        zoomToCell(null)
        e.preventDefault()
      } else if (e.key.startsWith('Arrow') && st.consultCell) {
        const n = neighborCell(st.consultCell, e.key)
        if (n) zoomToCell(n)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [active])

  const L = gridLayout(doc.wall, doc.grid)
  const cell = consultCell ? L.cells.find((c) => c.id === consultCell) : null
  return {
    // loupe « + » sur la vue d'ensemble, loupe « − » en vue détail (un clic ressort)
    cursor: pickPrint ? 'copy' : consultCell ? 'zoom-out' : 'zoom-in',
    onPointerDown(p) {
      if (p.button !== 0) return
      const c = cellAt(L, p.world)
      if (!c) return
      const st = useEditor.getState()
      if (st.pickPrint) togglePrintCell(c.id)
      // un clic zoome sur la case, un nouveau clic revient à la vue d'ensemble
      else zoomToCell(st.consultCell ? null : c.id)
    },
    renderWorld: () => (
      <g className="consult-layer">
        {doc.printCells.map((id) => {
          const c = L.cells.find((x) => x.id === id)
          return c ? <rect key={id} x={c.x} y={c.y} width={c.w} height={c.h} className="print-cell" data-testid="print-cell" /> : null
        })}
        {cell && <SubGrid cell={cell} step={doc.grid.subStep ?? 10} />}
        {cell && (
          <>
            {/* voile sur tout ce qui est hors de la case */}
            <path
              className="consult-veil"
              data-testid="consult-veil"
              fillRule="evenodd"
              d={`M${-doc.wall.w} ${-doc.wall.h}h${doc.wall.w * 3}v${doc.wall.h * 3}h${-doc.wall.w * 3}Z M${cell.x} ${cell.y}v${cell.h}h${cell.w}v${-cell.h}Z`}
            />
            <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} className="consult-cell-halo" />
            <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} className="consult-cell" />
          </>
        )}
      </g>
    ),
    renderScreen: () => {
      if (!cell) return null
      const vx = L.vLines.filter((l) => Math.abs(l.pos - cell.x) < 1e-6 || Math.abs(l.pos - (cell.x + cell.w)) < 1e-6)
      const hy = L.hLines.filter((l) => Math.abs(l.pos - cell.y) < 1e-6 || Math.abs(l.pos - (cell.y + cell.h)) < 1e-6)
      const tl = toScreen({ x: cell.x, y: cell.y })
      const br = toScreen({ x: cell.x + cell.w, y: cell.y + cell.h })
      const step = doc.grid.subStep ?? 10
      const sub = subLines(cell, step, doc)
      return (
        <g className="consult-overlay" data-testid="consult-overlay">
          {sub.v.map((l, i) => {
            const x = toScreen({ x: l.pos, y: 0 }).x
            return <text key={`sv${i}`} x={x} y={br.y + 40} className="sub-cote" textAnchor="middle">{fmt(l.cote)}</text>
          })}
          {sub.h.map((l, i) => {
            const y = toScreen({ x: 0, y: l.pos }).y
            return <text key={`sh${i}`} x={br.x + 10} y={y + 4} className="sub-cote">{fmt(l.cote)}</text>
          })}
          <g transform={`translate(${tl.x} ${tl.y - 58})`} className="consult-badge">
            <rect width={92} height={28} rx={14} />
            <text x={46} y={19} textAnchor="middle">Case {cell.id}</text>
          </g>
          {vx.map((l, i) => {
            const x = toScreen({ x: l.pos, y: 0 }).x
            const left = Math.abs(x - tl.x) < 1
            const anchor = left ? 'start' : 'end'
            const dx = left ? 6 : -6
            return (
              <g key={`v${i}`}>
                <text x={x + dx} y={tl.y - 10} className="consult-cote" textAnchor={anchor}>↔ {fmt(l.cote)} cm</text>
                <text x={x + dx} y={br.y + 22} className="consult-cote" textAnchor={anchor}>↔ {fmt(l.cote)} cm</text>
              </g>
            )
          })}
          {hy.map((l, i) => {
            const y = toScreen({ x: 0, y: l.pos }).y
            const top = Math.abs(y - tl.y) < 1
            const dy = top ? 20 : -8
            return (
              <g key={`h${i}`}>
                <text x={tl.x - 10} y={y + dy} className="consult-cote" textAnchor="end">↕ {fmt(l.cote)} cm</text>
                <text x={br.x + 10} y={y + dy} className="consult-cote">↕ {fmt(l.cote)} cm</text>
              </g>
            )
          })}
        </g>
      )
    },
  }
}

const fmt = (n: number) => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/** Lignes de la sous-grille dans une case, alignées sur l'origine de la grille. */
export function subLines(cell: { x: number; y: number; w: number; h: number }, step: number, doc: { wall: { w: number; h: number }; grid: { origin: string } }) {
  const fromRight = doc.grid.origin === 'br' || doc.grid.origin === 'tr'
  const fromBottom = doc.grid.origin === 'bl' || doc.grid.origin === 'br'
  const toCote = (pos: number, size: number, flip: boolean) => (flip ? size - pos : pos)
  const lines = (a: number, b: number, size: number, flip: boolean) => {
    const out: { pos: number; cote: number }[] = []
    const c0 = Math.min(toCote(a, size, flip), toCote(b, size, flip))
    const c1 = Math.max(toCote(a, size, flip), toCote(b, size, flip))
    if (step <= 0 || (c1 - c0) / step > 200) return out
    for (let c = Math.ceil((c0 + 1e-6) / step) * step; c < c1 - 1e-6; c += step) out.push({ pos: toCote(c, size, flip), cote: c })
    return out
  }
  return { v: lines(cell.x, cell.x + cell.w, doc.wall.w, fromRight), h: lines(cell.y, cell.y + cell.h, doc.wall.h, fromBottom) }
}

function SubGrid({ cell, step }: { cell: { x: number; y: number; w: number; h: number }; step: number }) {
  const doc = useEditor((s) => s.doc)
  const { v, h } = subLines(cell, step, doc)
  return (
    <g className="sub-grid">
      {/* sous-couche claire + tirets sombres : lisible sur tous les aplats */}
      {(['under', 'over'] as const).map((layer) => (
        <g key={layer} className={layer} data-testid={layer === 'over' ? 'sub-grid' : undefined}>
          {v.map((l, i) => <line key={`v${i}`} x1={l.pos} x2={l.pos} y1={cell.y} y2={cell.y + cell.h} />)}
          {h.map((l, i) => <line key={`h${i}`} x1={cell.x} x2={cell.x + cell.w} y1={l.pos} y2={l.pos} />)}
        </g>
      ))}
    </g>
  )
}
