import { create } from 'zustand'
import { produceWithPatches, type Draft, type Patch } from 'immer'
import type { DocState, GridLineStyle, Opening, RefImage, Shape, Variant, Vec, Rect } from '../model/types'
import { defaultDoc } from '../model/defaults'
import * as repo from './repo'

export type Tool = 'select' | 'polyline' | 'arc' | 'bezier' | 'trim' | 'fill' | 'erase' | 'pick' | 'measure' | 'image'
export type Mode = 'edit' | 'consult'

export interface View {
  zoom: number // px par cm
  panX: number
  panY: number
}

type AfterChange = (before: DocState, draft: Draft<DocState>) => void
const afterChangeHooks: AfterChange[] = []
/** Permet aux modules (ex. remplissage) de réagir à chaque modification, dans la même entrée d'historique. */
export function registerAfterChange(h: AfterChange) {
  afterChangeHooks.push(h)
}

let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn)
  queue = p.catch((e) => console.error('[frsque] persistance', e))
  return p
}
/** Attend que toutes les écritures soient terminées (tests). */
export async function flushPersistence() {
  let current
  do { current = queue; await current } while (current !== queue)
}
export function hasUnsavedWork() {
  return pending.length > 0 || !!useEditor.getState().saveError
}
export async function requireSaved() {
  await flushPersistence()
  if (!hasUnsavedWork()) return true
  useEditor.getState().flash('Réessayez l’enregistrement ou exportez le secours avant de continuer.', 'error')
  return false
}

/** Le mur appartient à une pièce : ouvertures et murs voisins. */
export interface RoomCtx {
  projectId: string
  index: number
  walls: { id: string; name: string; variantId: string | null }[]
  openings: Opening[]
  height: number
  /** Zones sans mur d'un dessin de murs liés (écart réel entre deux murs). */
  masks?: Rect[]
  /** Jonctions entre murs liés. */
  seams?: { x: number; name: string }[]
}

export interface EditorState {
  variant: Variant | null
  room: RoomCtx | null
  setRoom: (r: RoomCtx | null) => void
  doc: DocState
  headSeq: number
  maxSeq: number
  saveError: string | null
  retry: () => void
  historyBusy: boolean
  saving: number
  view: View
  tool: Tool
  mode: Mode
  selection: string[]
  activeColorId: string | null
  message: { text: string; kind: 'info' | 'error' } | null
  /** Révision incrémentée à chaque changement d'historique (pour rafraîchir la frise). */
  rev: number
  /** Formes modifiées temporairement (glisser en cours), non encore validées. */
  overrides: Record<string, Shape> | null
  clipboard: Shape[]
  selectedImageId: string | null
  /** Aperçu du style de grille pendant le réglage (avant enregistrement). */
  gridPreview: { lineWidth: number; lineOpacity: number; lineStyle?: GridLineStyle } | null
  /** Aperçu d'une teinte pendant le choix de couleur. */
  palettePreview: { id: string; hex: string } | null
  /** Mesure en cours (affichée dans le footer de mesure). */
  measure: { a: Vec; b: Vec; fixed: boolean } | null
  /** Case zoomée en mode consultation. */
  consultCell: string | null
  /** Mode « choisir les cases à imprimer ». */
  pickPrint: boolean
  setConsultCell: (id: string | null) => void
  setPickPrint: (v: boolean) => void
  imagePreview: { id: string; opacity: number } | null
  /** Image en cours de déplacement / redimensionnement (affichée en direct). */
  imageDrag: RefImage | null
  setImageDrag: (im: RefImage | null) => void

  setSelectedImage: (id: string | null) => void
  setImagePreview: (p: { id: string; opacity: number } | null) => void
  setOverrides: (o: Record<string, Shape> | null) => void
  setClipboard: (c: Shape[]) => void
  load: (variantId: string) => Promise<boolean>
  unload: () => void
  commit: (label: string, recipe: (d: Draft<DocState>) => void) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  goTo: (seq: number) => Promise<void>
  setView: (v: Partial<View>) => void
  setTool: (t: Tool) => void
  setMode: (m: Mode) => void
  setSelection: (ids: string[]) => void
  setActiveColor: (id: string | null) => void
  flash: (text: string, kind?: 'info' | 'error') => void
  screenToWorld: (p: Vec) => Vec
}

type Pending = { variantId: string; label: string; next: DocState; patches: Patch[]; inverse: Patch[] }
const pending: Pending[] = []
let durable: Variant | null = null
let loading = 0
let loadingCount = 0
let historyTarget: number | null = null
let historyRun: Promise<void> | null = null
const deferred: { label: string; recipe: (d: Draft<DocState>) => void }[] = []
let scheduled = false
function persist(verify = false) {
  if (scheduled) return queue
  scheduled = true
  return enqueue(async () => {
    useEditor.setState({ saving: 1 })
    try {
      if (useEditor.getState().saveError) return
      if (verify && !pending.length && durable) {
        const current = await repo.getVariant(durable.id)
        if (!current || current.headSeq !== durable.headSeq || current.maxSeq !== durable.maxSeq) throw new repo.ConflictError()
      }
      while (pending.length && durable) {
        const item = pending[0]
        if (item.variantId !== durable.id) throw new Error('Variante différente')
        const seq = await repo.recordChange(durable.id, item.label, item.next, item.patches, item.inverse, durable)
        durable = { ...durable, state: item.next, headSeq: seq, maxSeq: seq }
        pending.shift()
      }
    } catch (e) {
      useEditor.setState({ saveError: e instanceof repo.ConflictError ? e.message : 'Enregistrement impossible. Vos modifications restent en mémoire. Réessayez ou exportez une sauvegarde de secours avant de quitter.' })
    } finally {
      scheduled = false
      useEditor.setState({ saving: 0 })
    }
  })
}

let flashTimer: ReturnType<typeof setTimeout> | undefined

export const useEditor = create<EditorState>((set, get) => ({
  variant: null,
  room: null,
  setRoom(room) {
    set({ room })
  },
  doc: defaultDoc(),
  headSeq: 0,
  maxSeq: 0,
  historyBusy: false,
  saving: 0,
  saveError: null,
  retry() { set({ saveError: null }); void persist(true) },
  view: { zoom: 2, panX: 60, panY: 60 },
  tool: 'select',
  mode: 'edit',
  selection: [],
  activeColorId: null,
  message: null,
  rev: 0,
  overrides: null,
  clipboard: [],
  selectedImageId: null,
  consultCell: null,
  measure: null,
  palettePreview: null,
  gridPreview: null,
  pickPrint: false,
  setConsultCell(consultCell) {
    set({ consultCell })
  },
  setPickPrint(pickPrint) {
    set({ pickPrint })
  },
  imagePreview: null,
  imageDrag: null,
  setImageDrag(imageDrag) {
    set({ imageDrag })
  },

  setSelectedImage(selectedImageId) {
    set({ selectedImageId })
  },
  setImagePreview(imagePreview) {
    set({ imagePreview })
  },
  setOverrides(overrides) {
    set({ overrides })
  },
  setClipboard(clipboard) {
    set({ clipboard })
  },

  async load(variantId) {
    const request = ++loading
    loadingCount++
    try {
      await flushPersistence()
      if (pending.length) return get().variant?.id === variantId
      const v = await repo.getVariant(variantId)
      if (request !== loading || pending.length) return get().variant?.id === variantId
      if (!v) return false
      durable = v
      set({
        saveError: null, variant: v, room: null, doc: v.state, headSeq: v.headSeq, maxSeq: v.maxSeq, selection: [],
        activeColorId: v.state.palette[0]?.id ?? null, rev: get().rev + 1, mode: 'edit', tool: 'select',
      })
      return true
    } finally { loadingCount-- }
  },

  unload() {
    if (!pending.length) set({ variant: null, selection: [] })
  },

  commit(label, recipe) {
    const { doc, variant, headSeq, maxSeq } = get()
    if (!variant) return
    if (loadingCount) { get().flash('Chargement du dessin en cours. Réessayez cette modification après le chargement.', 'error'); return }
    if (get().historyBusy) { deferred.push({ label, recipe }); return }
    const [next, patches, inverse] = produceWithPatches(doc, (d) => {
      recipe(d)
      for (const h of afterChangeHooks) h(doc, d)
    })
    if (!patches.length) return
    // après un retour en arrière, une entrée « Retour à l'état » est insérée avant (voir repo.recordChange)
    const seq = maxSeq > headSeq ? maxSeq + 2 : headSeq + 1
    set((s) => ({ doc: next, headSeq: seq, maxSeq: seq, rev: s.rev + 1 }))
    set({ saving: 1 })
    pending.push({ variantId: variant.id, label, next, patches, inverse })
    void persist()
  },

  async undo() {
    const { headSeq } = get()
    if (headSeq <= 0) return
    await get().goTo(headSeq - 1)
  },

  async redo() {
    const { headSeq, maxSeq } = get()
    if (headSeq >= maxSeq) return
    await get().goTo(headSeq + 1)
  },

  async goTo(seq) {
    const { variant } = get()
    if (!variant) return
    historyTarget = seq
    if (historyRun) return historyRun
    set({ historyBusy: true })
    historyRun = enqueue(async () => {
      try {
        while (historyTarget !== null) {
          const target = historyTarget
          historyTarget = null
          if (get().saveError || pending.length || !durable) break
          const v = await repo.moveHead(variant.id, target, durable)
          durable = v
          const sel = new Set(v.state.shapes.map((s) => s.id))
          set((s) => ({ doc: v.state, headSeq: v.headSeq, rev: s.rev + 1, selection: s.selection.filter((id) => sel.has(id)) }))
        }
      } catch (e) {
        set({ saveError: e instanceof repo.ConflictError ? e.message : 'Déplacement dans l’historique impossible. Réessayez ou exportez le secours.' })
      } finally {
        historyTarget = null
        historyRun = null
        set({ historyBusy: false })
        for (const item of deferred.splice(0)) get().commit(item.label, item.recipe)
      }
    })
    return historyRun
  },

  setView(v) {
    set((s) => ({ view: { ...s.view, ...v } }))
  },
  setTool(tool) {
    set({ tool })
  },
  setMode(mode) {
    set({ mode, selection: mode === 'edit' ? get().selection : [], consultCell: null, pickPrint: false })
  },
  setSelection(selection) {
    set({ selection })
  },
  setActiveColor(activeColorId) {
    set({ activeColorId })
  },
  flash(text, kind = 'info') {
    set({ message: { text, kind } })
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => set({ message: null }), 3500)
  },
  screenToWorld(p) {
    const { view } = get()
    return { x: (p.x - view.panX) / view.zoom, y: (p.y - view.panY) / view.zoom }
  },
}))

// Le navigateur protège aussi la mémoire lors d’un rechargement ou d’une fermeture.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (pending.length || useEditor.getState().saveError) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
}
