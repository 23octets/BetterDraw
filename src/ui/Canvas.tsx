import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { GridLabels, GridLines } from './GridOverlay'
import { useActiveTool, type ToolPointer } from '../tools/useActiveTool'
import { DocLayers } from './DocLayers'

export function fitView(wall: { w: number; h: number }, size: { w: number; h: number }) {
  const margin = 70
  const zoom = Math.max(0.05, Math.min((size.w - margin * 2) / wall.w, (size.h - margin * 2) / wall.h))
  return { zoom, panX: (size.w - wall.w * zoom) / 2, panY: (size.h - wall.h * zoom) / 2 }
}

export function Canvas() {
  const doc = useEditor((s) => s.doc)
  const view = useEditor((s) => s.view)
  const mode = useEditor((s) => s.mode)
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
    const onFit = () => setView(fitView(useEditor.getState().doc.wall, size))
    window.addEventListener('bd:fit', onFit)
    return () => window.removeEventListener('bd:fit', onFit)
  }, [size, setView])

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
    >
      <g transform={t} data-testid="world">
        <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} className="wall-shadow" />
        <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} fill={doc.background.hex} className="wall" data-testid="wall" />
        <DocLayers doc={doc} mode={mode} />
        <GridLines doc={doc} strong={mode === 'consult'} />
        <rect x={0} y={0} width={doc.wall.w} height={doc.wall.h} className="wall-outline" />
        {tool.renderWorld?.()}
      </g>
      <GridLabels doc={doc} view={view} />
      {tool.renderScreen?.()}
    </svg>
  )
}
