import { useEffect, useReducer, useRef } from 'react'
import type { Vec } from '../model/types'
import { dist, mid } from '../geometry/vec'
import type { SnapResult } from '../geometry/snap'
import { fmtLen, ScreenLabel, snapFor, SnapMarker, useToolKeys } from './common'
import type { ToolHandlers } from './useActiveTool'
import { useEditor } from '../store/editor'

interface Draft {
  a: Vec | null
  b: Vec | null
  fixed: boolean
  hover: SnapResult | null
}
const empty = (): Draft => ({ a: null, b: null, fixed: false, hover: null })

export function measureText(a: Vec, b: Vec) {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  let ang = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI
  if (ang < 0) ang += 360
  return {
    main: fmtLen(dist(a, b)),
    detail: `↔ ${fmtLen(dx)} · ↕ ${fmtLen(dy)} · ${Math.round(ang * 10) / 10}°`,
  }
}

/** Outil mesure : deux clics, la mesure reste affichée jusqu'au clic suivant ou Échap. */
export function useMeasureTool(active: boolean): ToolHandlers {
  const draft = useRef<Draft>(empty())
  const [, render] = useReducer((x: number) => x + 1, 0)
  const zoom = useEditor((s) => s.view.zoom)

  useEffect(() => {
    if (!active && draft.current.a) {
      draft.current = empty()
      render()
    }
  })

  useToolKeys(active, (e) => {
    if (e.key === 'Escape') {
      draft.current = empty()
      render()
      return true
    }
  })

  const d = draft.current
  return {
    cursor: 'crosshair',
    onPointerDown(p) {
      if (p.button !== 0) return
      const dd = draft.current
      const s = snapFor(p, { from: dd.fixed ? undefined : dd.a ?? undefined })
      if (!dd.a || dd.fixed) draft.current = { a: s.p, b: s.p, fixed: false, hover: s }
      else draft.current = { ...dd, b: s.p, fixed: true }
      render()
    },
    onPointerMove(p) {
      const dd = draft.current
      const s = snapFor(p, { from: dd.a && !dd.fixed ? dd.a : undefined })
      draft.current = { ...dd, hover: s, b: dd.a && !dd.fixed ? s.p : dd.b }
      render()
    },
    renderWorld: () =>
      d.a &&
      d.b && (
        <g className="measure" data-testid="measure">
          <line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} />
          <circle cx={d.a.x} cy={d.a.y} r={3 / zoom} />
          <circle cx={d.b.x} cy={d.b.y} r={3 / zoom} />
        </g>
      ),
    renderScreen: () => {
      const t = d.a && d.b && dist(d.a, d.b) > 0.01 ? measureText(d.a, d.b) : null
      return (
        <>
          <SnapMarker snap={d.hover} />
          {t && (
            <>
              <ScreenLabel at={mid(d.a!, d.b!)} testId="measure-label" dy={-16}>{t.main}</ScreenLabel>
              <ScreenLabel at={mid(d.a!, d.b!)} testId="measure-detail" dy={8}>{t.detail}</ScreenLabel>
            </>
          )}
        </>
      )
    },
  }
}
