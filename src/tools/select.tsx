import { useEffect, useReducer, useRef } from 'react'
import { useEditor } from '../store/editor'
import type { Shape, Vec } from '../model/types'
import { distToShape, segCount, segPoint, arcMidPoint, shapeToD } from '../geometry/shapes'
import { dist, sub } from '../geometry/vec'
import { bendSegment, cloneShapes, moveControl, moveVertex, shapesInRect, translateShapes } from '../geometry/edit'
import { snapPoint, type SnapResult } from '../geometry/snap'
import { snapFor, SnapMarker, useToolKeys } from './common'
import type { ToolHandlers, ToolPointer } from './useActiveTool'
import { setPendingCarry } from '../store/fills'

type Handle =
  | { kind: 'vertex'; shapeId: string; i: number }
  | { kind: 'mid'; shapeId: string; i: number }
  | { kind: 'ctrl'; shapeId: string; i: number; which: 'c1' | 'c2' }

type Drag =
  | { kind: 'move'; start: Vec; ids: string[]; anchor: Vec; moved: boolean }
  | { kind: 'handle'; handle: Handle; moved: boolean }
  | { kind: 'marquee'; start: Vec; cur: Vec; add: boolean }

const HIT_PX = 7

export function hitShape(shapes: Shape[], p: Vec, tol: number): Shape | null {
  let best: Shape | null = null
  let bd = tol
  for (const s of shapes) {
    const d = distToShape(p, s)
    if (d <= bd) {
      bd = d
      best = s
    }
  }
  return best
}

export function shapeHandles(s: Shape): { h: Handle; p: Vec }[] {
  const out: { h: Handle; p: Vec }[] = []
  for (let i = 0; i < segCount(s); i++) {
    const g = s.segs[i]
    if (g.t === 'cubic') {
      out.push({ h: { kind: 'ctrl', shapeId: s.id, i, which: 'c1' }, p: g.c1 })
      out.push({ h: { kind: 'ctrl', shapeId: s.id, i, which: 'c2' }, p: g.c2 })
    } else {
      const p0 = s.pts[i]
      const p1 = s.pts[(i + 1) % s.pts.length]
      out.push({ h: { kind: 'mid', shapeId: s.id, i }, p: g.t === 'arc' ? arcMidPoint(p0, p1, g.bulge) : segPoint(s, i, 0.5) })
    }
  }
  s.pts.forEach((p, i) => out.push({ h: { kind: 'vertex', shapeId: s.id, i }, p }))
  return out
}

export function useSelectTool(active: boolean): ToolHandlers {
  const drag = useRef<Drag | null>(null)
  const hover = useRef<SnapResult | null>(null)
  const [, render] = useReducer((x: number) => x + 1, 0)
  const selection = useEditor((s) => s.selection)
  const doc = useEditor((s) => s.doc)
  const zoom = useEditor((s) => s.view.zoom)
  const overrides = useEditor((s) => s.overrides)

  useEffect(() => {
    if (!active && drag.current) {
      drag.current = null
      useEditor.getState().setOverrides(null)
    }
  })

  useToolKeys(active, (e) => {
    const st = useEditor.getState()
    if ((e.key === 'Delete' || e.key === 'Backspace') && st.selection.length) {
      deleteSelection()
      return true
    }
    if (e.key === 'Escape' && st.selection.length) {
      st.setSelection([])
      return true
    }
    if (e.key.startsWith('Arrow') && st.selection.length) {
      const k = (e.shiftKey ? 10 : 1) * st.doc.grid.snapStep
      const d = { ArrowLeft: { x: -k, y: 0 }, ArrowRight: { x: k, y: 0 }, ArrowUp: { x: 0, y: -k }, ArrowDown: { x: 0, y: k } }[e.key]
      if (d) moveSelection(d)
      return true
    }
  })

  const selShapes = doc.shapes.filter((s) => selection.includes(s.id)).map((s) => overrides?.[s.id] ?? s)
  const single = selShapes.length === 1 ? selShapes[0] : null

  const findHandle = (p: Vec): Handle | null => {
    if (!single) return null
    const tol = (HIT_PX + 2) / zoom
    // sommets prioritaires
    const hs = shapeHandles(single).sort((a, b) => (a.h.kind === 'vertex' ? -1 : 1) - (b.h.kind === 'vertex' ? -1 : 1))
    let best: Handle | null = null
    let bd = tol
    for (const { h, p: q } of hs) {
      const d = dist(p, q)
      if (d < bd - 1e-9) {
        bd = d
        best = h
      }
    }
    return best
  }

  const applyHandle = (s: Shape, h: Handle, p: ToolPointer): Shape => {
    if (h.kind === 'vertex') {
      const st = useEditor.getState()
      const snap = snapPoint({ ...st.doc, shapes: st.doc.shapes.filter((x) => x.id !== s.id) }, p.world, {
        radius: 10 / st.view.zoom,
        disabled: p.alt,
        extra: s.pts.filter((_, k) => k !== h.i),
      })
      hover.current = snap
      return moveVertex(s, h.i, snap.p)
    }
    hover.current = null
    if (h.kind === 'mid') return bendSegment(s, h.i, p.world)
    return moveControl(s, h.i, h.which, p.world)
  }

  return {
    cursor: 'default',
    onPointerDown(p) {
      if (p.button !== 0) return
      const st = useEditor.getState()
      const h = findHandle(p.world)
      if (h) {
        drag.current = { kind: 'handle', handle: h, moved: false }
        return
      }
      const hit = hitShape(st.doc.shapes, p.world, HIT_PX / st.view.zoom)
      if (hit) {
        let ids = st.selection
        if (p.shift) ids = ids.includes(hit.id) ? ids.filter((x) => x !== hit.id) : [...ids, hit.id]
        else if (!ids.includes(hit.id)) ids = [hit.id]
        st.setSelection(ids)
        // ancre : sommet le plus proche du clic, pour l'aimantage pendant le déplacement
        const anchor = hit.pts.reduce((a, b) => (dist(a, p.world) < dist(b, p.world) ? a : b))
        drag.current = { kind: 'move', start: p.world, ids, anchor, moved: false }
      } else {
        drag.current = { kind: 'marquee', start: p.world, cur: p.world, add: p.shift }
        if (!p.shift) st.setSelection([])
      }
      render()
    },
    onPointerMove(p) {
      const st = useEditor.getState()
      const dr = drag.current
      if (!dr) {
        hover.current = null
        return
      }
      if (dr.kind === 'marquee') {
        drag.current = { ...dr, cur: p.world }
        render()
        return
      }
      if (dr.kind === 'move') {
        if (!dr.moved && dist(p.world, dr.start) * st.view.zoom < 3) return
        const ids = new Set(dr.ids)
        const target = sub(p.world, dr.start)
        const want = { x: dr.anchor.x + target.x, y: dr.anchor.y + target.y }
        const snap = snapFor({ ...p, shift: false, world: want }, { exclude: ids })
        hover.current = snap.kind === 'grille' ? null : snap
        const delta = p.shift
          ? Math.abs(target.x) > Math.abs(target.y) ? { x: snap.p.x - dr.anchor.x, y: 0 } : { x: 0, y: snap.p.y - dr.anchor.y }
          : sub(snap.p, dr.anchor)
        const moved = translateShapes(st.doc.shapes.filter((s) => ids.has(s.id)), delta)
        st.setOverrides(Object.fromEntries(moved.map((s) => [s.id, s])))
        drag.current = { ...dr, moved: true }
        render()
        return
      }
      const s = st.doc.shapes.find((x) => x.id === dr.handle.shapeId)
      if (!s) return
      st.setOverrides({ [s.id]: applyHandle(s, dr.handle, p) })
      drag.current = { ...dr, moved: true }
      render()
    },
    onPointerUp() {
      const st = useEditor.getState()
      const dr = drag.current
      drag.current = null
      hover.current = null
      if (dr?.kind === 'marquee') {
        const ids = shapesInRect(st.doc.shapes, dr.start, dr.cur)
        st.setSelection(dr.add ? [...new Set([...st.selection, ...ids])] : ids)
      } else if (dr && dr.moved && st.overrides) {
        const ov = st.overrides
        if (dr.kind === 'move') {
          const first = st.doc.shapes.find((s) => ov[s.id])
          if (first) {
            const d = sub(ov[first.id].pts[0], first.pts[0])
            setPendingCarry({ ids: new Set(Object.keys(ov)), m: [1, 0, 0, 1, d.x, d.y] })
          }
        }
        const label = dr.kind === 'move' ? `Déplacer (${Object.keys(ov).length})` : dr.handle.kind === 'vertex' ? 'Déplacer un point' : dr.handle.kind === 'mid' ? 'Courber un segment' : 'Modifier une courbe'
        st.commit(label, (d) => {
          d.shapes = d.shapes.map((s) => ov[s.id] ?? s) as typeof d.shapes
        })
      }
      st.setOverrides(null)
      render()
    },
    onDoubleClick(p) {
      // double-clic sur une poignée de milieu d'arc : redevient droit
      const h = findHandle(p.world)
      if (h?.kind === 'mid' && single && single.segs[h.i].t === 'arc') {
        useEditor.getState().commit('Redresser un segment', (d) => {
          const s = d.shapes.find((x) => x.id === single.id)
          if (s) s.segs[h.i] = { t: 'line' }
        })
      }
    },
    renderWorld: () => {
      const dr = drag.current
      return (
        <g className="selection-layer">
          {selShapes.map((s) => (
            <path key={s.id} d={shapeToD(s)} className="selected-shape" data-testid="selected-shape" />
          ))}
          {single &&
            shapeHandles(single).map(({ h, p }, k) => {
              const r = (h.kind === 'vertex' ? 4.5 : 3.5) / zoom
              if (h.kind === 'ctrl') {
                const anchor = h.which === 'c1' ? single.pts[h.i] : single.pts[(h.i + 1) % single.pts.length]
                return (
                  <g key={k}>
                    <line x1={anchor.x} y1={anchor.y} x2={p.x} y2={p.y} className="handle-line" />
                    <circle cx={p.x} cy={p.y} r={r} className="handle-dot" data-testid="handle-ctrl" />
                  </g>
                )
              }
              return h.kind === 'vertex' ? (
                <rect key={k} x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} className="handle-vertex" data-testid="handle-vertex" />
              ) : (
                <circle key={k} cx={p.x} cy={p.y} r={r} className="handle-mid" data-testid="handle-mid" />
              )
            })}
          {dr?.kind === 'marquee' && (
            <rect
              x={Math.min(dr.start.x, dr.cur.x)}
              y={Math.min(dr.start.y, dr.cur.y)}
              width={Math.abs(dr.cur.x - dr.start.x)}
              height={Math.abs(dr.cur.y - dr.start.y)}
              className="marquee"
            />
          )}
        </g>
      )
    },
    renderScreen: () => <SnapMarker snap={hover.current} />,
  }
}

export function deleteSelection() {
  const st = useEditor.getState()
  const ids = new Set(st.selection)
  if (!ids.size) return
  st.commit(`Supprimer (${ids.size})`, (d) => {
    d.shapes = d.shapes.filter((s) => !ids.has(s.id))
  })
  st.setSelection([])
}

export function moveSelection(delta: Vec) {
  const st = useEditor.getState()
  const ids = new Set(st.selection)
  setPendingCarry({ ids, m: [1, 0, 0, 1, delta.x, delta.y] })
  st.commit('Déplacer', (d) => {
    d.shapes = d.shapes.map((s) => (ids.has(s.id) ? translateShapes([s as Shape], delta)[0] : s)) as typeof d.shapes
  })
}

export function copySelection() {
  const st = useEditor.getState()
  const shapes = st.doc.shapes.filter((s) => st.selection.includes(s.id))
  if (shapes.length) st.setClipboard(structuredClone(shapes))
  return shapes.length
}

export function pasteClipboard(offset = 10) {
  const st = useEditor.getState()
  if (!st.clipboard.length) return
  const clones = cloneShapes(st.clipboard, { x: offset, y: offset })
  st.commit(`Coller (${clones.length})`, (d) => {
    d.shapes.push(...clones)
  })
  st.setClipboard(translateShapes(st.clipboard, { x: offset, y: offset }))
  st.setSelection(clones.map((s) => s.id))
}

export function duplicateSelection() {
  if (copySelection()) pasteClipboard()
}
