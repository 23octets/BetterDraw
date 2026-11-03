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

/** Outil images : glisser pour déplacer, flèches aux coins pour agrandir (proportions conservées). */
export function useImageTool(selectedId: string | null, setSelectedId: (id: string | null) => void): ToolHandlers {
  const drag = useRef<Drag | null>(null)
  const preview = useRef<RefImage | null>(null)
  const [, render] = useReducer((x: number) => x + 1, 0)
  const zoom = useEditor((s) => s.view.zoom)
  const images = useEditor((s) => s.doc.images)
  const sel = images.find((i) => i.id === selectedId) ?? null
  const shown = preview.current && sel && preview.current.id === sel.id ? preview.current : sel

  const cornerAt = (p: Vec): number => {
    if (!shown || shown.locked) return -1
    const tol = 12 / zoom
    return imageCorners(shown).findIndex((c) => Math.abs(c.x - p.x) < tol && Math.abs(c.y - p.y) < tol)
  }

  return {
    cursor: 'move',
    onPointerDown(p) {
      if (p.button !== 0) return
      const corner = cornerAt(p.world)
      if (corner >= 0 && shown) {
        drag.current = { kind: 'resize', id: shown.id, corner, orig: shown }
        return
      }
      const hit = [...images].reverse().find((im) => im.visible && p.world.x >= im.x && p.world.x <= im.x + im.w && p.world.y >= im.y && p.world.y <= im.y + im.h)
      setSelectedId(hit?.id ?? null)
      if (hit && !hit.locked) drag.current = { kind: 'move', id: hit.id, start: p.world, orig: hit }
      render()
    },
    onPointerMove(p) {
      const d = drag.current
      if (!d) return
      if (d.kind === 'move') preview.current = { ...d.orig, x: d.orig.x + p.world.x - d.start.x, y: d.orig.y + p.world.y - d.start.y }
      else preview.current = { ...d.orig, ...resizeKeepRatio(d.orig, d.corner, p.world) }
      render()
    },
    onPointerUp() {
      const d = drag.current
      const pv = preview.current
      drag.current = null
      preview.current = null
      if (d && pv && (pv.x !== d.orig.x || pv.y !== d.orig.y || pv.w !== d.orig.w)) {
        useEditor.getState().commit(d.kind === 'move' ? 'Déplacer une image' : 'Redimensionner une image', (doc) => {
          const im = doc.images.find((i) => i.id === d.id)
          if (im) Object.assign(im, { x: pv.x, y: pv.y, w: pv.w, h: pv.h })
        })
      }
      render()
    },
    renderWorld: () =>
      shown && (
        <g className="image-handles" data-testid="image-selection">
          <rect x={shown.x} y={shown.y} width={shown.w} height={shown.h} className="image-frame" />
          {!shown.locked &&
            imageCorners(shown).map((c, i) => {
              const s = 9 / zoom
              const rot = [225, 315, 45, 135][i]
              return (
                <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${rot})`} className="image-corner" data-testid="image-corner">
                  <circle r={s} />
                  <path d={`M${-s * 0.5} 0 H${s * 0.5} M${s * 0.15} ${-s * 0.35} L${s * 0.5} 0 L${s * 0.15} ${s * 0.35}`} />
                </g>
              )
            })}
        </g>
      ),
  }
}
