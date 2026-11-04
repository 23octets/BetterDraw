import type { ReactNode } from 'react'
import type { Vec } from '../model/types'
import { useEditor } from '../store/editor'
import { usePolylineTool } from './polyline'
import { useArcTool } from './arc'
import { useBezierTool } from './bezier'
import { useMeasureTool } from './measure'
import { useSelectTool } from './select'
import { useEraseTool, useFillTool, usePickTool } from './paint'
import { useImageTool } from './image'
import { useConsultTool } from './consult'
import { useTrimTool } from './trim'

export interface ToolPointer {
  screen: Vec
  world: Vec
  shift: boolean
  alt: boolean
  meta: boolean
  button: number
}

export interface ToolHandlers {
  cursor?: string
  onPointerDown?: (p: ToolPointer) => void
  onPointerMove?: (p: ToolPointer) => void
  onPointerUp?: (p: ToolPointer) => void
  onPointerLeave?: () => void
  onDoubleClick?: (p: ToolPointer) => void
  renderWorld?: () => ReactNode
  renderScreen?: () => ReactNode
}

/** Mesure en consultation : les clics mesurent, mais ⌥ + clic reste réservé aux cases à imprimer et les repères de la vue restent affichés. */
function withMeasure(consult: ToolHandlers, measure: ToolHandlers): ToolHandlers {
  return {
    ...measure,
    cursor: consult.cursor === 'copy' ? 'copy' : measure.cursor,
    onPointerDown: (p) => (p.alt ? consult : measure).onPointerDown?.(p),
    onPointerMove(p) {
      consult.onPointerMove?.(p)
      measure.onPointerMove?.(p)
    },
    onPointerLeave() {
      consult.onPointerLeave?.()
      measure.onPointerLeave?.()
    },
    renderWorld: () => (
      <>
        {consult.renderWorld?.()}
        {measure.renderWorld?.()}
      </>
    ),
    renderScreen: () => (
      <>
        {consult.renderScreen?.()}
        {measure.renderScreen?.()}
      </>
    ),
  }
}

export function useActiveTool(): ToolHandlers {
  const tool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  const edit = mode === 'edit'
  const selectedImageId = useEditor((s) => s.selectedImageId)
  const setSelectedImage = useEditor((s) => s.setSelectedImage)
  const tools: Partial<Record<string, ToolHandlers>> = {
    select: useSelectTool(edit && tool === 'select'),
    polyline: usePolylineTool(edit && tool === 'polyline'),
    arc: useArcTool(edit && tool === 'arc'),
    bezier: useBezierTool(edit && tool === 'bezier'),
    measure: useMeasureTool(tool === 'measure'),
    trim: useTrimTool(),
    fill: useFillTool(),
    erase: useEraseTool(),
    pick: usePickTool(),
    image: useImageTool(selectedImageId, setSelectedImage),
  }
  const consult = useConsultTool(mode === 'consult')
  if (mode === 'consult') return tool === 'measure' ? withMeasure(consult, tools.measure!) : consult
  return tools[tool] ?? {}
}
