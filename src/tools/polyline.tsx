import { useEffect, useReducer, useRef } from 'react'
import { nanoid } from 'nanoid'
import { useEditor } from '../store/editor'
import type { Segment, Shape, Vec } from '../model/types'
import { segEndTangent, shapeToD, tangentArcBulge } from '../geometry/shapes'
import { dist, eq } from '../geometry/vec'
import { parseLengthInput, type SnapResult } from '../geometry/snap'
import { fmtLen, numericKey, ScreenLabel, snapFor, SnapMarker, useToolKeys, SNAP_PX } from './common'
import type { ToolHandlers, ToolPointer } from './useActiveTool'

interface Draft {
  pts: Vec[]
  segs: Segment[]
  arcMode: boolean
  hover: SnapResult | null
  cursor: Vec | null
  buf: string
}

const empty = (): Draft => ({ pts: [], segs: [], arcMode: false, hover: null, cursor: null, buf: '' })

export function nextSegment(d: Pick<Draft, 'pts' | 'segs' | 'arcMode'>, p: Vec): Segment {
  if (!d.arcMode || d.pts.length === 0) return { t: 'line' }
  const last = d.pts[d.pts.length - 1]
  if (d.segs.length === 0) return { t: 'arc', bulge: Math.tan(Math.PI / 8) }
  const tmp: Shape = { id: '', pts: d.pts, segs: d.segs, closed: false }
  const u = segEndTangent(tmp, d.segs.length - 1)
  return { t: 'arc', bulge: tangentArcBulge(last, u, p) }
}

export function usePolylineTool(active: boolean): ToolHandlers {
  const draft = useRef<Draft>(empty())
  const [, render] = useReducer((x: number) => x + 1, 0)
  const commit = useEditor((s) => s.commit)

  const finish = (close = false) => {
    const d = draft.current
    const pts = [...d.pts]
    const segs = [...d.segs]
    if (close && pts.length >= 3) {
      segs.push(nextSegment({ pts, segs, arcMode: d.arcMode }, pts[0]))
    }
    if (pts.length >= 2) {
      const shape: Shape = { id: nanoid(10), pts, segs, closed: close && pts.length >= 3 }
      commit(shape.closed ? 'Forme fermée' : `Ligne (${pts.length - 1} segment${pts.length > 2 ? 's' : ''})`, (doc) => {
        doc.shapes.push(shape)
      })
    }
    draft.current = { ...empty(), arcMode: d.arcMode }
    render()
  }

  // Termine le tracé si on change d'outil
  useEffect(() => {
    if (!active && draft.current.pts.length) finish()
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const addPoint = (p: Vec) => {
    const d = draft.current
    if (d.pts.length && eq(p, d.pts[d.pts.length - 1], 1e-6)) return
    if (d.pts.length >= 2 && eq(p, d.pts[0], 1e-6)) return finish(true)
    const seg = nextSegment(d, p)
    draft.current = { ...d, pts: [...d.pts, p], segs: d.pts.length ? [...d.segs, seg] : d.segs, buf: '' }
    render()
  }

  const move = (p: ToolPointer) => {
    const d = draft.current
    const last = d.pts[d.pts.length - 1]
    const hover = snapFor(p, { from: last, extra: d.pts.length >= 2 ? [d.pts[0]] : [] })
    draft.current = { ...d, hover, cursor: hover.p }
    render()
  }

  useToolKeys(active, (e) => {
    const d = draft.current
    if (d.pts.length && numericKey(e, d.buf, (buf) => { draft.current = { ...d, buf }; render() })) return true
    if (e.key === 'Enter') {
      if (d.buf && d.pts.length) {
        const p = parseLengthInput(d.buf, d.pts[d.pts.length - 1], d.cursor ?? d.pts[d.pts.length - 1])
        if (p) addPoint(p)
        else useEditor.getState().flash('Saisie invalide : tape une longueur, ex. 120 ou 120<45', 'error')
        draft.current = { ...draft.current, buf: '' }
        render()
      } else finish()
      return true
    }
    if (e.key === 'Escape') {
      if (d.buf) draft.current = { ...d, buf: '' }
      else if (d.pts.length >= 2) finish()
      else draft.current = { ...empty(), arcMode: d.arcMode }
      render()
      return true
    }
    if (e.key === 'Backspace' && d.pts.length) {
      draft.current = { ...d, pts: d.pts.slice(0, -1), segs: d.segs.slice(0, Math.max(0, d.pts.length - 2)) }
      render()
      return true
    }
    if (e.key.toLowerCase() === 'a') {
      draft.current = { ...d, arcMode: !d.arcMode }
      useEditor.getState().flash(draft.current.arcMode ? 'Mode arc tangent' : 'Mode ligne droite')
      render()
      return true
    }
  })

  const d = draft.current
  const last = d.pts[d.pts.length - 1]
  let preview: Shape | null = null
  if (d.pts.length) {
    const pts = [...d.pts]
    const segs = [...d.segs]
    if (d.cursor && !eq(d.cursor, last)) {
      segs.push(nextSegment(d, d.cursor))
      pts.push(d.cursor)
    }
    preview = { id: 'draft', pts, segs, closed: false }
  }

  return {
    cursor: 'crosshair',
    onPointerDown(p) {
      if (p.button !== 0) return
      const s = snapFor(p, { from: last, extra: d.pts.length >= 2 ? [d.pts[0]] : [] })
      addPoint(s.p)
    },
    onPointerMove: move,
    onPointerLeave() {
      draft.current = { ...draft.current, hover: null, cursor: null }
      render()
    },
    onDoubleClick() {
      const dd = draft.current
      if (dd.pts.length >= 2) finish()
    },
    renderWorld: () =>
      preview && (
        <g className="draft">
          <path d={shapeToD(preview)} className="draft-path" data-testid="draft-path" />
          {d.pts.map((q, i) => (
            <circle key={i} cx={q.x} cy={q.y} r={SNAP_PX / 3 / useEditor.getState().view.zoom} className="draft-node" />
          ))}
        </g>
      ),
    renderScreen: () => (
      <>
        <SnapMarker snap={d.hover} />
        {last && d.cursor && !d.buf && dist(last, d.cursor) > 0.01 && (
          <ScreenLabel at={d.cursor} testId="draft-length" dy={22}>
            {`${fmtLen(dist(last, d.cursor))}${d.arcMode ? ' (arc)' : ''}`}
          </ScreenLabel>
        )}
        {d.buf && d.cursor && (
          <ScreenLabel at={d.cursor} testId="numeric-input" dy={22}>
            {`Longueur : ${d.buf}▌ cm`}
          </ScreenLabel>
        )}
      </>
    ),
  }
}
