import { nanoid } from 'nanoid'
import type { DocState, PaletteColor } from './types'

export const DEFAULT_WALL = { w: 300, h: 250 }

export function defaultPalette(): PaletteColor[] {
  return [
    { id: nanoid(8), name: 'Bleu canard', hex: '#1f6f78' },
    { id: nanoid(8), name: 'Terracotta', hex: '#c8643b' },
    { id: nanoid(8), name: 'Ocre', hex: '#e0a43a' },
    { id: nanoid(8), name: 'Vert sauge', hex: '#9caf88' },
    { id: nanoid(8), name: 'Rose poudré', hex: '#e8b4a6' },
    { id: nanoid(8), name: 'Anthracite', hex: '#33363b' },
  ]
}

export function defaultDoc(): DocState {
  return {
    wall: { ...DEFAULT_WALL },
    grid: { step: 50, origin: 'bl', snapStep: 5, show: true, subStep: 10, lineWidth: 1, lineOpacity: 1 },
    shapes: [],
    fills: [],
    palette: defaultPalette(),
    background: { hex: '#f4f1ea', repaint: false },
    paint: { coverage: 10, coats: 2, showLiters: true },
    images: [],
    printCells: [],
  }
}
