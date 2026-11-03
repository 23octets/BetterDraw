import type { ReactNode } from 'react'
import type { Vec } from '../model/types'
import { useEditor } from '../store/editor'
import { usePolylineTool } from './polyline'
import { useArcTool } from './arc'
import { useBezierTool } from './bezier'
import { useMeasureTool } from './measure'
import { useSelectTool } from './select'

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

export function useActiveTool(): ToolHandlers {
  const tool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  const edit = mode === 'edit'
  const tools: Partial<Record<string, ToolHandlers>> = {
    select: useSelectTool(edit && tool === 'select'),
    polyline: usePolylineTool(edit && tool === 'polyline'),
    arc: useArcTool(edit && tool === 'arc'),
    bezier: useBezierTool(edit && tool === 'bezier'),
    measure: useMeasureTool(tool === 'measure'),
  }
  if (!edit && tool !== 'measure') return {}
  return tools[tool] ?? {}
}
