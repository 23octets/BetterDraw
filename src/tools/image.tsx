import { useReducer, useRef } from 'react'
import { useEditor } from '../store/editor'
import type { RefImage, Vec } from '../model/types'
import { resizeKeepRatio } from '../store/images'
import type { ToolHandlers } from './useActiveTool'

type Drag = { kind: 'move'; id: string; start: Vec; orig: RefImage } | { kind: 'resize'; id: string; corner: number; orig: RefImage }

export function imageCorners(im: Pick<RefImage, 'x' | 'y' | 'w' | 'h'>): Vec[] {
  return [
    { x: im.x, y: im.y },
    { x: im.x + im.w, y: im.y },
    { x: im.x + im.w, y: im.y + im.h },
    { x: im.x, y: im.y + im.h },
  ]
}

const CORNER_CURSOR = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']

/** Outil images : glisser pour déplacer (l'image suit), flèches aux coins pour agrandir (proportions conservées). */
export function useImageTool(selectedId: string | null, setSelectedId: (id: string | null) => void): ToolHandlers {
  const drag = useRef<Drag | null>(null)
  const [cursor, setCursor] = useReducer((_: string, c: string) => c, 'default')
  const zoom = useEditor((s) => s.view.zoom)
  const images = useEditor((s) => s.doc.images)
  const live = useEditor((s) => s.imageDrag)
  const sel = images.find((i) => i.id === selectedId) ?? null
  const shown = live && sel && live.id === sel.id ? live : sel

  const cornerAt = (p: Vec): number => {
    if (!shown || shown.locked || !shown.visible) return -1
    const tol = 14 / zoom
    return imageCorners(shown).findIndex((c) => Math.abs(c.x - p.x) < tol && Math.abs(c.y - p.y) < tol)
  }
  const imageAt = (p: Vec) => [...images].reverse().find((im) => im.visible && p.x >= im.x && p.x <= im.x + im.w && p.y >= im.y && p.y <= im.y + im.h)

  return {
    cursor,
    onPointerDown(p) {
      if (p.button !== 0) return
      const corner = cornerAt(p.world)
      if (corner >= 0 && shown) {
        drag.current = { kind: 'resize', id: shown.id, corner, orig: shown }
        return
      }
      const hit = imageAt(p.world)
      setSelectedId(hit?.id ?? null)
      if (hit && !hit.locked) {
        drag.current = { kind: 'move', id: hit.id, start: p.world, orig: hit }
        setCursor('grabbing')
      }
    },
    onPointerMove(p) {
      const d = drag.current
      const st = useEditor.getState()
      if (!d) {
        const corner = cornerAt(p.world)
        const hit = imageAt(p.world)
        setCursor(corner >= 0 ? CORNER_CURSOR[corner] : hit && !hit.locked ? 'grab' : 'default')
        return
      }
      if (d.kind === 'move') st.setImageDrag({ ...d.orig, x: d.orig.x + p.world.x - d.start.x, y: d.orig.y + p.world.y - d.start.y })
      else st.setImageDrag({ ...d.orig, ...resizeKeepRatio(d.orig, d.corner, p.world) })
    },
    onPointerUp() {
      const st = useEditor.getState()
      const d = drag.current
      const pv = st.imageDrag
      drag.current = null
      if (d && pv && (pv.x !== d.orig.x || pv.y !== d.orig.y || pv.w !== d.orig.w)) {
        st.commit(d.kind === 'move' ? 'Déplacer une image' : 'Redimensionner une image', (doc) => {
          const im = doc.images.find((i) => i.id === d.id)
          if (im) Object.assign(im, { x: pv.x, y: pv.y, w: pv.w, h: pv.h })
        })
      }
      st.setImageDrag(null)
      if (d?.kind === 'move') setCursor('grab')
    },
    renderWorld: () =>
      shown && shown.visible && (
        <g className="image-handles" data-testid="image-selection">
          <rect x={shown.x} y={shown.y} width={shown.w} height={shown.h} className="image-frame" />
          {!shown.locked &&
            imageCorners(shown).map((c, i) => {
              const s = 10 / zoom
              const rot = [225, 315, 45, 135][i]
              return (
                <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${rot})`} className="image-corner" data-testid="image-corner" style={{ cursor: CORNER_CURSOR[i] }}>
                  <circle r={s} />
                  <path d={`M${-s * 0.5} 0 H${s * 0.5} M${s * 0.15} ${-s * 0.35} L${s * 0.5} 0 L${s * 0.15} ${s * 0.35}`} />
                </g>
              )
            })}
        </g>
      ),
  }
}
