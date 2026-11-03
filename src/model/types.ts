export interface Vec {
  x: number
  y: number
}

/**
 * Segment reliant pts[i] à pts[i+1] (ou dernier → premier si la forme est fermée).
 * - line : droite
 * - arc : arc de cercle, `bulge` = tan(angle balayé / 4). Le signe indique le côté
 *   (positif = du côté de la normale n = (-dy, dx)).
 * - cubic : courbe de Bézier, points de contrôle absolus.
 */
export type Segment =
  | { t: 'line' }
  | { t: 'arc'; bulge: number }
  | { t: 'cubic'; c1: Vec; c2: Vec }

export interface Shape {
  id: string
  pts: Vec[]
  segs: Segment[]
  closed: boolean
}

export interface Fill {
  id: string
  /** Point intérieur de la zone peinte (sert à la retrouver après recalcul). */
  seed: Vec
  colorId: string
}

export interface PaletteColor {
  id: string
  name: string
  hex: string
}

export interface RefImage {
  id: string
  /** Référence vers la table images (dataURL). */
  blobId: string
  name: string
  x: number
  y: number
  w: number
  h: number
  opacity: number
  locked: boolean
  visible: boolean
}

export type GridOrigin = 'bl' | 'tl' | 'br' | 'tr'

export interface GridSettings {
  step: number
  origin: GridOrigin
  snapStep: number
  /** Pas de la sous-grille affichée en vue détail (consultation). */
  subStep?: number
  show: boolean
}

export interface DocState {
  wall: { w: number; h: number }
  grid: GridSettings
  shapes: Shape[]
  fills: Fill[]
  palette: PaletteColor[]
  background: { hex: string; repaint: boolean }
  paint: { coverage: number; coats: number; showLiters: boolean }
  images: RefImage[]
  printCells: string[]
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface Wall {
  id: string
  projectId: string
  name: string
}

export interface Variant {
  id: string
  projectId: string
  wallId: string
  name: string
  parentId?: string
  parentSeq?: number
  createdAt: number
  updatedAt: number
  /** Position actuelle dans l'historique. */
  headSeq: number
  /** Dernière entrée d'historique existante. */
  maxSeq: number
  state: DocState
}

export interface HistoryEntry {
  variantId: string
  seq: number
  label: string
  ts: number
  patches: unknown[]
  inverse: unknown[]
}

export interface StoredImage {
  id: string
  dataUrl: string
  width: number
  height: number
}
