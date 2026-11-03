import { useEffect, useRef } from 'react'
import { useEditor } from '../store/editor'
import { constrainAngle, snapPoint, type SnapResult } from '../geometry/snap'
import type { Vec } from '../model/types'
import type { ToolPointer } from './useActiveTool'

export const SNAP_PX = 10

/** Point aimanté pour un événement pointeur. Alt désactive l'aimantage, Shift contraint l'angle depuis `from`. */
export function snapFor(p: ToolPointer, opts: { from?: Vec; extra?: Vec[]; exclude?: Set<string> } = {}): SnapResult {
  const { doc, view } = useEditor.getState()
  if (p.shift && opts.from) return { p: constrainAngle(opts.from, p.world, p.alt ? 0 : doc.grid.snapStep), kind: 'angle' }
  return snapPoint(doc, p.world, { radius: SNAP_PX / view.zoom, extra: opts.extra, exclude: opts.exclude, disabled: p.alt })
}

export function toScreen(p: Vec): Vec {
  const v = useEditor.getState().view
  return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY }
}

export function SnapMarker({ snap }: { snap: SnapResult | null }) {
  useEditor((s) => s.view)
  if (!snap) return null
  const s = toScreen(snap.p)
  const strong = snap.kind !== 'grille' && snap.kind !== 'libre' && snap.kind !== 'angle'
  return (
    <g className="snap-marker" data-testid="snap-marker" data-kind={snap.kind}>
      {strong ? <rect x={s.x - 5} y={s.y - 5} width={10} height={10} /> : <circle cx={s.x} cy={s.y} r={3} />}
      {strong && (
        <text x={s.x + 9} y={s.y - 8} className="snap-label">
          {snap.kind}
        </text>
      )}
    </g>
  )
}

export function ScreenLabel({ at, children, testId, dy = -14 }: { at: Vec; children: React.ReactNode; testId?: string; dy?: number }) {
  useEditor((s) => s.view)
  const s = toScreen(at)
  const text = String(children)
  const w = text.length * 6.6 + 12
  return (
    <g className="screen-label" data-testid={testId} transform={`translate(${s.x} ${s.y + dy})`}>
      <rect x={-w / 2} y={-11} width={w} height={20} rx={4} />
      <text textAnchor="middle" y={3}>
        {text}
      </text>
    </g>
  )
}

export function fmtLen(n: number) {
  const r = Math.round(n * 10) / 10
  return `${Number.isInteger(r) ? r : r.toFixed(1)} cm`
}

/** Écoute le clavier quand l'outil est actif (en ignorant les champs de saisie). */
export function useToolKeys(active: boolean, handler: (e: KeyboardEvent) => boolean | void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey) return
      if (ref.current(e) === true) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [active])
}

/** Gère un tampon de saisie numérique (« 120 » ou « 120<30 »). Renvoie true si la touche est consommée. */
export function numericKey(e: KeyboardEvent, buf: string, setBuf: (s: string) => void): boolean {
  if (/^[0-9.,<-]$/.test(e.key)) {
    setBuf(buf + e.key)
    return true
  }
  if (e.key === 'Backspace' && buf) {
    setBuf(buf.slice(0, -1))
    return true
  }
  return false
}
