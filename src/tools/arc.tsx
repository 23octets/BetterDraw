import { useEffect, useReducer, useRef } from 'react'
import { nanoid } from 'nanoid'
import { useEditor } from '../store/editor'
import type { Shape, Vec } from '../model/types'
import { arcGeometry, bulgeFromThrough, shapeToD } from '../geometry/shapes'
import { dist, eq } from '../geometry/vec'
import { parseLengthInput, type SnapResult } from '../geometry/snap'
import { fmtLen, numericKey, ScreenLabel, snapFor, SnapMarker, useToolKeys } from './common'
import type { ToolHandlers } from './useActiveTool'

interface Draft {
  a: Vec | null
  b: Vec | null
  hover: SnapResult | null
  cursor: Vec | null
  buf: string
}
const empty = (): Draft => ({ a: null, b: null, hover: null, cursor: null, buf: '' })

/** Outil arc : 1er clic = départ, 2e = arrivée, 3e = point de passage. */
export function useArcTool(active: boolean): ToolHandlers {
  const draft = useRef<Draft>(empty())
  const [, render] = useReducer((x: number) => x + 1, 0)
  const commit = useEditor((s) => s.commit)

  useEffect(() => {
    if (!active && draft.current.a) {
      draft.current = empty()
      render()
    }
  })

  const place = (p: Vec) => {
    const d = draft.current
    if (!d.a) draft.current = { ...d, a: p, buf: '' }
    else if (!d.b) {
      if (eq(p, d.a)) return
      draft.current = { ...d, b: p, buf: '' }
    } else {
      const bulge = bulgeFromThrough(d.a, d.b, p)
      const shape: Shape = { id: nanoid(10), pts: [d.a, d.b], segs: [{ t: 'arc', bulge }], closed: false }
      commit('Arc', (doc) => {
        doc.shapes.push(shape)
      })
      draft.current = empty()
    }
    render()
  }

  useToolKeys(active, (e) => {
    const d = draft.current
    if (d.a && !d.b && numericKey(e, d.buf, (buf) => { draft.current = { ...d, buf }; render() })) return true
    if (e.key === 'Enter' && d.buf && d.a) {
      const p = parseLengthInput(d.buf, d.a, d.cursor ?? d.a)
      if (p) place(p)
      return true
    }
    if (e.key === 'Escape' && d.a) {
      draft.current = empty()
      render()
      return true
    }
  })

  const d = draft.current
  let preview: Shape | null = null
  let radius = 0
  if (d.a && d.cursor) {
    if (!d.b) preview = { id: 'draft', pts: [d.a, d.cursor], segs: [{ t: 'line' }], closed: false }
    else {
      const bulge = bulgeFromThrough(d.a, d.b, d.cursor)
      preview = { id: 'draft', pts: [d.a, d.b], segs: [{ t: 'arc', bulge }], closed: false }
      if (Math.abs(bulge) > 1e-6) radius = arcGeometry(d.a, d.b, bulge).radius
    }
  }

  return {
    cursor: 'crosshair',
    onPointerDown(p) {
      if (p.button !== 0) return
      const dd = draft.current
      const s = dd.b ? snapFor(p) : snapFor(p, { from: dd.a ?? undefined })
      place(s.p)
    },
    onPointerMove(p) {
      const dd = draft.current
      const hover = dd.b ? snapFor(p) : snapFor(p, { from: dd.a ?? undefined })
      draft.current = { ...dd, hover, cursor: hover.p }
      render()
    },
    renderWorld: () =>
      preview && (
        <g className="draft">
          <path d={shapeToD(preview)} className="draft-path" data-testid="draft-path" />
          {d.b && <line x1={d.a!.x} y1={d.a!.y} x2={d.b.x} y2={d.b.y} className="draft-guide" />}
        </g>
      ),
    renderScreen: () => (
      <>
        <SnapMarker snap={d.hover} />
        {d.cursor && d.a && !d.b && !d.buf && <ScreenLabel at={d.cursor} dy={22}>{fmtLen(dist(d.a, d.cursor))}</ScreenLabel>}
        {d.cursor && d.b && radius > 0 && <ScreenLabel at={d.cursor} dy={22} testId="arc-radius">{`R ${fmtLen(radius)}`}</ScreenLabel>}
        {d.buf && d.cursor && <ScreenLabel at={d.cursor} dy={22} testId="numeric-input">{`Corde : ${d.buf}▌ cm`}</ScreenLabel>}
        {!d.a && d.cursor && <ScreenLabel at={d.cursor} dy={22}>départ de l'arc</ScreenLabel>}
      </>
    ),
  }
}
