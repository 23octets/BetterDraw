import { storageError } from '../store/storage'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { GridLabels } from './GridOverlay'
import { GridLinesAdaptive } from './GridLinesAdaptive'
import { useActiveTool, type ToolPointer } from '../tools/useActiveTool'
import { DocLayers } from './DocLayers'
import { importImageFiles } from './ImagesSection'
import { openingRect, windowBars } from '../room/geometry'

export function fitView(wall: { w: number; h: number; x?: number; y?: number }, size: { w: number; h: number }, margin = 70) {
  const ox = wall.x ?? 0
  const oy = wall.y ?? 0
  // marge du bas plus grande : les contrôles de zoom flottent en bas à droite
  const bottomExtra = 36
  const zoom = Math.max(0.05, Math.min((size.w - margin * 2) / wall.w, (size.h - margin * 2 - bottomExtra) / wall.h))
  return { zoom, panX: (size.w - wall.w * zoom) / 2 - ox * zoom, panY: (size.h - bottomExtra - wall.h * zoom) / 2 - oy * zoom }
}

export function Canvas() {
  const doc = useEditor((s) => s.doc)
  const view = useEditor((s) => s.view)
  const mode = useEditor((s) => s.mode)
  const gridPreview = useEditor((s) => s.gridPreview)
  const setView = useEditor((s) => s.setView)
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const panning = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const fitted = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
      if (!fitted.current && r.width > 0) {
        fitted.current = true
        setView(fitView(useEditor.getState().doc.wall, { w: r.width, h: r.height }))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [setView])

  useEffect(() => {
    const onFit = (e: Event) => {
      const rect = (e as CustomEvent<{ x: number; y: number; w: number; h: number } | null>).detail
      setView(rect ? fitView(rect, size, 90) : fitView(useEditor.getState().doc.wall, size))
    }
    window.addEventListener('bd:fit', onFit)
    return () => window.removeEventListener('bd:fit', onFit)
  }, [size, setView])

  // la taille du mur change : on réajuste la vue
  const wallKey = `${doc.wall.w}x${doc.wall.h}`
  const lastWall = useRef(wallKey)
  useEffect(() => {
    if (lastWall.current === wallKey) return
    lastWall.current = wallKey
    setView(fitView(doc.wall, size))
  }, [wallKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const tool = useActiveTool()

  const toPointer = useCallback(
    (e: React.PointerEvent | React.MouseEvent): ToolPointer => {
      const r = ref.current!.getBoundingClientRect()
      const screen = { x: e.clientX - r.left, y: e.clientY - r.top }
      const v = useEditor.getState().view
      return {
        screen,
        world: { x: (screen.x - v.panX) / v.zoom, y: (screen.y - v.panY) / v.zoom },
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey || e.ctrlKey,
        button: 'button' in e ? e.button : 0,
      }
    },
    [],
  )

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) setSpaceDown(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Zoom (pincement / ctrl+molette) et défilement
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = useEditor.getState().view
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        const sx = e.clientX - r.left
        const sy = e.clientY - r.top
        const k = Math.exp(-e.deltaY * 0.01)
        const zoom = Math.max(0.05, Math.min(80, v.zoom * k))
        const wx = (sx - v.panX) / v.zoom
        const wy = (sy - v.panY) / v.zoom
        setView({ zoom, panX: sx - wx * zoom, panY: sy - wy * zoom })
      } else {
        setView({ panX: v.panX - e.deltaX, panY: v.panY - e.deltaY })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setView])

  function onPointerDown(e: React.PointerEvent) {
    ref.current?.setPointerCapture(e.pointerId)
    if (e.button === 1 || e.button === 2 || spaceDown) {
      const v = useEditor.getState().view
      panning.current = { x: e.clientX, y: e.clientY, px: v.panX, py: v.panY }
      return
    }
    tool.onPointerDown?.(toPointer(e))
  }
  function onPointerMove(e: React.PointerEvent) {
    if (panning.current) {
      const p = panning.current
      setView({ panX: p.px + e.clientX - p.x, panY: p.py + e.clientY - p.y })
      return
    }
    tool.onPointerMove?.(toPointer(e))
  }
  function onPointerUp(e: React.PointerEvent) {
    if (panning.current) {
      panning.current = null
      return
    }
    tool.onPointerUp?.(toPointer(e))
  }

  const t = `translate(${view.panX} ${view.panY}) scale(${view.zoom})`
  return (
    <svg
      ref={ref}
      className={`canvas mode-${mode}${spaceDown || panning.current ? ' panning' : ''}`}
      style={{ cursor: spaceDown ? 'grab' : tool.cursor }}
      data-testid="canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => tool.onPointerLeave?.()}
      onDoubleClick={(e) => tool.onDoubleClick?.(toPointer(e))}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (e.dataTransfer.files.length) importImageFiles(e.dataTransfer.files).catch((err) => useEditor.getState().flash(storageError(err), 'error'))
      }}
    >
      <g transform={t} data-testid="world">
        <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} className="wall-shadow" />
        <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} fill={doc.background.hex} className="wall" data-testid="wall" />
        <DocLayers doc={doc} mode={mode} />
        <OpeningsLayer wallH={doc.wall.h} />
        <GridLinesAdaptive doc={doc} strong={mode === 'consult'} idPrefix="cv" style={gridPreview} />
        <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} className="wall-outline" />
        {tool.renderWorld?.()}
      </g>
      <GridLabels doc={doc} view={view} />
      {tool.renderScreen?.()}
    </svg>
  )
}

/** Portes et fenêtres de la pièce, en surimpression (on ne peint pas dedans en 3D). */
function OpeningsLayer({ wallH }: { wallH: number }) {
  const room = useEditor((s) => s.room)
  if (!room || (!room.openings.length && !room.masks?.length && !room.seams?.length)) return null
  return (
    <g className="openings-layer" data-testid="openings-layer">
      <defs>
        <pattern id="opening-hatch" className="opening-hatch-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" />
        </pattern>
      </defs>
      {room.masks?.map((m, k) => (
        <g key={`m${k}`} className="opening-overlay gap" data-testid="group-gap">
          <rect x={m.x} y={m.y} width={m.w} height={m.h} className="opening-fill" />
          <rect x={m.x} y={m.y} width={m.w} height={m.h} fill="url(#opening-hatch)" className="opening-hatch" />
          <text x={m.x + m.w / 2} y={Math.min(m.h / 2, 40)} textAnchor="middle" className="opening-label" fontSize={Math.max(6, Math.min(14, m.w / 5))}>Pas de mur</text>
        </g>
      ))}
      {room.seams?.map((s, k) => (
        <g key={`s${k}`} className="group-seam" data-testid="group-seam">
          {s.x > 0 && <line x1={s.x} y1={0} x2={s.x} y2={wallH} />}
        </g>
      ))}
      {room.openings.map((o) => {
        const r = openingRect(o, wallH)
        return (
          <g key={o.id} className={`opening-overlay ${o.kind}`}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} className="opening-fill" />
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="url(#opening-hatch)" className="opening-hatch" />
            {windowBars(o, wallH).map(([x1, y1, x2, y2], k) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} className="opening-bar" />)}
            <text x={r.x + r.w / 2} y={r.y + Math.min(r.h / 2, 30)} textAnchor="middle" className="opening-label" fontSize={Math.max(6, Math.min(14, r.w / 6))}>
              {o.kind === 'door' ? 'Porte' : 'Fenêtre'}
            </text>
          </g>
        )
      })}
    </g>
  )
}
