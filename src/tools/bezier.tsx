import { useEffect, useReducer, useRef } from 'react'
import { nanoid } from 'nanoid'
import { useEditor } from '../store/editor'
import type { Segment, Shape, Vec } from '../model/types'
import { shapeToD } from '../geometry/shapes'
import { add, dist, eq, sub } from '../geometry/vec'
import type { SnapResult } from '../geometry/snap'
import { snapFor, SnapMarker, useToolKeys, SNAP_PX } from './common'
import type { ToolHandlers } from './useActiveTool'

export interface PenNode {
  p: Vec
  /** Poignée sortante (relative) ; l'entrante est symétrique. */
  out: Vec
}

interface Draft {
  nodes: PenNode[]
  dragging: boolean
  hover: SnapResult | null
  cursor: Vec | null
}
const empty = (): Draft => ({ nodes: [], dragging: false, hover: null, cursor: null })

export function nodesToShape(nodes: PenNode[], closed: boolean, id = nanoid(10)): Shape {
  const segs: Segment[] = []
  const n = nodes.length
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const a = nodes[i]
    const b = nodes[(i + 1) % n]
    if (a.out.x === 0 && a.out.y === 0 && b.out.x === 0 && b.out.y === 0) segs.push({ t: 'line' })
    else segs.push({ t: 'cubic', c1: add(a.p, a.out), c2: sub(b.p, b.out) })
  }
  return { id, pts: nodes.map((x) => x.p), segs, closed }
}

/** Outil plume : clic = point anguleux, cliquer-glisser = point lisse avec poignées. */
export function useBezierTool(active: boolean): ToolHandlers {
  const draft = useRef<Draft>(empty())
  const [, render] = useReducer((x: number) => x + 1, 0)
  const commit = useEditor((s) => s.commit)

  const finish = (closed = false) => {
    const d = draft.current
    if (d.nodes.length >= 2) {
      const shape = nodesToShape(d.nodes, closed && d.nodes.length >= 3)
      commit(shape.closed ? 'Courbe fermée' : 'Courbe', (doc) => {
        doc.shapes.push(shape)
      })
    }
    draft.current = empty()
    render()
  }

  useEffect(() => {
    if (!active && draft.current.nodes.length) finish()
  }) // eslint-disable-line react-hooks/exhaustive-deps

  useToolKeys(active, (e) => {
    const d = draft.current
    if (e.key === 'Enter' || (e.key === 'Escape' && d.nodes.length)) {
      finish()
      return true
    }
    if (e.key === 'Backspace' && d.nodes.length) {
      draft.current = { ...d, nodes: d.nodes.slice(0, -1) }
      render()
      return true
    }
  })

  const d = draft.current
  let preview: Shape | null = null
  if (d.nodes.length) {
    const nodes = [...d.nodes]
    if (d.cursor && !d.dragging && !eq(d.cursor, nodes[nodes.length - 1].p)) nodes.push({ p: d.cursor, out: { x: 0, y: 0 } })
    preview = nodes.length >= 2 ? nodesToShape(nodes, false, 'draft') : null
  }
  const zoom = useEditor.getState().view.zoom

  return {
    cursor: 'crosshair',
    onPointerDown(p) {
      if (p.button !== 0) return
      const dd = draft.current
      const last = dd.nodes[dd.nodes.length - 1]
      const s = snapFor(p, { from: last?.p, extra: dd.nodes.length >= 2 ? [dd.nodes[0].p] : [] })
      if (dd.nodes.length >= 2 && eq(s.p, dd.nodes[0].p)) return finish(true)
      if (last && eq(s.p, last.p)) return
      draft.current = { ...dd, nodes: [...dd.nodes, { p: s.p, out: { x: 0, y: 0 } }], dragging: true }
      render()
    },
    onPointerMove(p) {
      const dd = draft.current
      if (dd.dragging) {
        const nodes = [...dd.nodes]
        const last = nodes[nodes.length - 1]
        const out = sub(p.world, last.p)
        nodes[nodes.length - 1] = { ...last, out: dist(p.world, last.p) * zoom < 3 ? { x: 0, y: 0 } : out }
        draft.current = { ...dd, nodes, cursor: p.world, hover: null }
      } else {
        const last = dd.nodes[dd.nodes.length - 1]
        const hover = snapFor(p, { from: last?.p, extra: dd.nodes.length >= 2 ? [dd.nodes[0].p] : [] })
        draft.current = { ...dd, hover, cursor: hover.p }
      }
      render()
    },
    onPointerUp() {
      draft.current = { ...draft.current, dragging: false }
      render()
    },
    onDoubleClick() {
      if (draft.current.nodes.length >= 2) finish()
    },
    renderWorld: () => (
      <g className="draft">
        {preview && <path d={shapeToD(preview)} className="draft-path" data-testid="draft-path" />}
        {d.nodes.map((n, i) => (
          <g key={i}>
            {(n.out.x !== 0 || n.out.y !== 0) && (
              <>
                <line x1={n.p.x - n.out.x} y1={n.p.y - n.out.y} x2={n.p.x + n.out.x} y2={n.p.y + n.out.y} className="handle-line" />
                <circle cx={n.p.x + n.out.x} cy={n.p.y + n.out.y} r={3 / zoom} className="handle-dot" />
                <circle cx={n.p.x - n.out.x} cy={n.p.y - n.out.y} r={3 / zoom} className="handle-dot" />
              </>
            )}
            <circle cx={n.p.x} cy={n.p.y} r={SNAP_PX / 3 / zoom} className="draft-node" />
          </g>
        ))}
      </g>
    ),
    renderScreen: () => <SnapMarker snap={d.hover} />,
  }
}
