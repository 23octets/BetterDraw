import { useReducer, useRef } from 'react'
import { useEditor } from '../store/editor'
import { planTrim, type TrimPlan } from '../geometry/trim'
import { shapeToD } from '../geometry/shapes'
import { hitShape } from './select'
import type { ToolHandlers } from './useActiveTool'

const HIT_PX = 8

/** Outil couper : supprime le bout de trait survolé, jusqu'aux intersections les plus proches. */
export function useTrimTool(): ToolHandlers {
  const plan = useRef<TrimPlan | null>(null)
  const [, render] = useReducer((x: number) => x + 1, 0)
  return {
    cursor: 'crosshair',
    onPointerMove(p) {
      const st = useEditor.getState()
      const hit = hitShape(st.doc.shapes, p.world, HIT_PX / st.view.zoom)
      const next = hit ? planTrim(st.doc, hit, p.world) : null
      if (next?.removed && plan.current && shapeToD(next.removed) === shapeToD(plan.current.removed)) return
      plan.current = next
      render()
    },
    onPointerLeave() {
      plan.current = null
      render()
    },
    onPointerDown(p) {
      if (p.button !== 0) return
      const st = useEditor.getState()
      const hit = hitShape(st.doc.shapes, p.world, HIT_PX / st.view.zoom)
      if (!hit) return
      const pl = planTrim(st.doc, hit, p.world)
      if (!pl) return
      st.commit('Couper un bout de trait', (d) => {
        const i = d.shapes.findIndex((s) => s.id === pl.shapeId)
        if (i >= 0) d.shapes.splice(i, 1, ...pl.keep)
      })
      st.setSelection([])
      plan.current = null
      render()
    },
    renderWorld: () =>
      plan.current && <path d={shapeToD(plan.current.removed)} className="trim-preview" data-testid="trim-preview" />,
  }
}
