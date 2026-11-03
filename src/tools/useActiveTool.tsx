import type { ReactNode } from 'react'
import type { Vec } from '../model/types'

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
  return {}
}
