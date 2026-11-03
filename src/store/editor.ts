import { create } from 'zustand'
import { produceWithPatches, type Draft } from 'immer'
import type { DocState, Shape, Variant, Vec } from '../model/types'
import { defaultDoc } from '../model/defaults'
import * as repo from './repo'

export type Tool = 'select' | 'polyline' | 'arc' | 'bezier' | 'fill' | 'erase' | 'pick' | 'measure' | 'image'
export type Mode = 'edit' | 'render' | 'consult'

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
  queue = p.catch((e) => console.error('[betterdraw] persistance', e))
  return p
}
/** Attend que toutes les écritures soient terminées (tests). */
export function flushPersistence() {
  return queue
}

export interface EditorState {
  variant: Variant | null
  doc: DocState
  headSeq: number
  maxSeq: number
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

let flashTimer: ReturnType<typeof setTimeout> | undefined

export const useEditor = create<EditorState>((set, get) => ({
  variant: null,
  doc: defaultDoc(),
  headSeq: 0,
  maxSeq: 0,
  saving: 0,
  view: { zoom: 2, panX: 60, panY: 60 },
  tool: 'select',
  mode: 'edit',
  selection: [],
  activeColorId: null,
  message: null,
  rev: 0,
  overrides: null,
  clipboard: [],

  setOverrides(overrides) {
    set({ overrides })
  },
  setClipboard(clipboard) {
    set({ clipboard })
  },

  async load(variantId) {
    await queue
    const v = await repo.getVariant(variantId)
    if (!v) return false
    set({
      variant: v, doc: v.state, headSeq: v.headSeq, maxSeq: v.maxSeq, selection: [],
      activeColorId: v.state.palette[0]?.id ?? null, rev: get().rev + 1, mode: 'edit', tool: 'select',
    })
    return true
  },

  unload() {
    set({ variant: null, selection: [] })
  },

  commit(label, recipe) {
    const { doc, variant, headSeq } = get()
    if (!variant) return
    const [next, patches, inverse] = produceWithPatches(doc, (d) => {
      recipe(d)
      for (const h of afterChangeHooks) h(doc, d)
    })
    if (!patches.length) return
    const seq = headSeq + 1
    set((s) => ({ doc: next, headSeq: seq, maxSeq: seq, saving: s.saving + 1, rev: s.rev + 1 }))
    enqueue(() => repo.recordChange(variant.id, label, next, patches, inverse)).finally(() =>
      set((s) => ({ saving: s.saving - 1 })),
    )
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
    const v = await enqueue(() => repo.moveHead(variant.id, seq))
    const sel = new Set(v.state.shapes.map((s) => s.id))
    set((s) => ({ doc: v.state, headSeq: v.headSeq, rev: s.rev + 1, selection: s.selection.filter((id) => sel.has(id)) }))
  },

  setView(v) {
    set((s) => ({ view: { ...s.view, ...v } }))
  },
  setTool(tool) {
    set({ tool })
  },
  setMode(mode) {
    set({ mode, selection: mode === 'edit' ? get().selection : [] })
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
