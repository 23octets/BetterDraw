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

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Réglages non destructifs d'une image : perspective corrigée puis recadrage. */
export interface ImageEdit {
  /** Image d'origine (jamais modifiée). */
  sourceBlobId: string
  /** Coins du mur sur la photo d'origine (px) : haut-gauche, haut-droit, bas-droit, bas-gauche. */
  quad: Vec[]
  /** Dimensions réelles du rectangle (cm), pour des proportions et une échelle exactes. */
  realSize: { w: number; h: number } | null
  /** Image corrigée complète (px). */
  full: { w: number; h: number }
  /** Rectangle issu du quadrilatère, dans l'image corrigée (px). */
  rect: Rect
  /** Partie conservée de l'image corrigée (px). */
  crop: Rect
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
  edit?: ImageEdit
}

export type GridOrigin = 'bl' | 'tl' | 'br' | 'tr'
export type GridLineStyle = 'solid' | 'dashed' | 'dotted' | 'longdash' | 'dashdot'

export interface GridSettings {
  step: number
  origin: GridOrigin
  snapStep: number
  /** Pas vertical (lignes) s'il diffère du pas horizontal ; absent = identique. */
  stepY?: number
  /** Pas de la sous-grille affichée en vue détail (consultation). */
  subStep?: number
  /** Épaisseur des lignes de grille (px à l'écran, 1 = normal). */
  lineWidth?: number
  /** Opacité des lignes de grille (0–1). */
  lineOpacity?: number
  /** Type de trait des lignes de grille. */
  lineStyle?: GridLineStyle
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

export type OpeningKind = 'door' | 'window'

/** Porte ou fenêtre percée dans un mur de la pièce. Coordonnées du mur vu de l'intérieur (cm). */
export interface Opening {
  id: string
  kind: OpeningKind
  /** Bord gauche, depuis le coin gauche du mur (vu de l'intérieur). */
  x: number
  w: number
  h: number
  /** Allège : hauteur du bas de l'ouverture au-dessus du sol (0 pour une porte). */
  sill: number
  /** Fenêtre : carreaux en colonnes × lignes (par défaut 1 ou 2 colonnes selon la largeur, 1 ligne). */
  cols?: number
  rows?: number
  /** Fenêtre : hauteur du soubassement vitré (cm, compris dans h, en bas de la fenêtre) ; 0 ou absent = aucun. */
  base?: number
}

export interface RoomWall {
  /** Identifiant du mur (table walls) : ses variantes portent la peinture. */
  id: string
  openings: Opening[]
  /** Longueur verrouillée : les modifications du plan se reportent sur les autres murs. */
  locked?: boolean
}

/**
 * Murs liés, peints ensemble sur un seul dessin « déroulé » (peinture continue).
 * `id` est celui du mur (table walls) qui porte les variantes de ce dessin.
 */
export interface RoomGroup {
  id: string
  /** Identifiants des murs liés (RoomWall.id). */
  walls: string[]
}

/**
 * Plan d'une pièce : polygone des coins intérieurs (cm, vue de dessus, y vers le bas),
 * parcouru dans le sens horaire à l'écran. walls[i] va de pts[i] à pts[i + 1].
 */
export interface RoomPlan {
  pts: Vec[]
  walls: RoomWall[]
  /** Hauteur sous plafond (cm). */
  height: number
  /** Épaisseur des murs (cm), vers l'extérieur. */
  thickness: number
  floor: string
  /** Murs liés (un mur appartient au plus à un groupe). */
  groups?: RoomGroup[]
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Présent si le projet est une pièce (plusieurs murs). */
  room?: RoomPlan
}

export interface Wall {
  id: string
  projectId: string
  name: string
  /** Variante affichée dans la vue 3D de la pièce. */
  variantId?: string
  /** Dessin d'un groupe de murs liés (pas un mur du plan). */
  group?: boolean
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
  addedAt?: number
  id: string
  dataUrl: string
  width: number
  height: number
}
