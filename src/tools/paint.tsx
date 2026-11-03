import { useReducer, useRef } from 'react'
import { useEditor } from '../store/editor'
import { colorAt, eraseAt, fillAt } from '../store/fills'
import { buildRegions, findGaps, regionAt } from '../geometry/regions'
import type { Vec } from '../model/types'
import type { ToolHandlers } from './useActiveTool'
import { toScreen } from './common'

const GAP_PX = 14

function insideWall(p: Vec) {
  const { wall } = useEditor.getState().doc
  return p.x > 0 && p.y > 0 && p.x < wall.w && p.y < wall.h
}

export function useFillTool(): ToolHandlers {
  const gaps = useRef<Vec[]>([])
  const hover = useRef<string | null>(null)
  const [, render] = useReducer((x: number) => x + 1, 0)
  useEditor((s) => s.view)
  return {
    cursor: 'cell',
    onPointerDown(p) {
      if (p.button !== 0) return
      const st = useEditor.getState()
      if (!insideWall(p.world)) return
      if (!st.activeColorId) return st.flash('Choisis une couleur dans la palette', 'error')
      const graph = buildRegions(st.doc.shapes, st.doc.wall)
      const region = regionAt(graph, p.world)
      if (!region) return
      if (!p.alt) {
        const found = findGaps(st.doc, region, graph, GAP_PX / st.view.zoom)
        if (found.length) {
          gaps.current = found
          render()
          st.flash(`Zone mal fermée : ${found.length} trou${found.length > 1 ? 's' : ''} repéré${found.length > 1 ? 's' : ''} (Alt+clic pour peindre quand même)`, 'error')
          return
        }
      }
      gaps.current = []
      const res = fillAt(st.doc, p.world, st.activeColorId)
      if (!res) return
      const name = st.doc.palette.find((c) => c.id === st.activeColorId)?.name ?? ''
      st.commit(`Peindre (${name})`, (d) => {
        d.fills = res.fills
      })
      render()
    },
    onPointerMove(p) {
      const st = useEditor.getState()
      if (!insideWall(p.world)) {
        if (hover.current) {
          hover.current = null
          render()
        }
        return
      }
      const r = regionAt(buildRegions(st.doc.shapes, st.doc.wall), p.world)
      const d = r?.d ?? null
      if (d !== hover.current) {
        hover.current = d
        render()
      }
    },
    onPointerLeave() {
      hover.current = null
      render()
    },
    renderWorld: () => (
      <>
        {hover.current && <path d={hover.current} className="region-hover" data-testid="region-hover" />}
      </>
    ),
    renderScreen: () => (
      <g data-testid="gaps">
        {gaps.current.map((g, i) => {
          const s = toScreen(g)
          return <circle key={i} cx={s.x} cy={s.y} r={14} className="gap-marker" data-testid="gap-marker" />
        })}
      </g>
    ),
  }
}

export function useEraseTool(): ToolHandlers {
  return {
    cursor: 'not-allowed',
    onPointerDown(p) {
      if (p.button !== 0) return
      const st = useEditor.getState()
      const fills = eraseAt(st.doc, p.world)
      if (!fills) return
      st.commit('Dépeindre une zone', (d) => {
        d.fills = fills
      })
    },
  }
}

export function usePickTool(): ToolHandlers {
  return {
    cursor: 'copy',
    onPointerDown(p) {
      if (p.button !== 0) return
      const st = useEditor.getState()
      const id = colorAt(st.doc, p.world)
      if (id) {
        st.setActiveColor(id)
        st.setTool('fill')
        st.flash(`Couleur : ${st.doc.palette.find((c) => c.id === id)?.name}`)
      } else st.flash('Cette zone n’est pas peinte')
    },
  }
}
