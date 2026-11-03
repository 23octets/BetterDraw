import { useEffect, useRef, useState } from 'react'
import * as repo from '../store/repo'
import type { Variant } from '../model/types'
import { navigate } from './router'
import { DocPreview } from './DocPreview'
import { surfaces } from '../store/fills'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Comparaison côte à côte de 2 à 4 variantes, zoom et déplacement synchronisés. */
export function CompareView({ ids }: { ids: string[] }) {
  const [variants, setVariants] = useState<Variant[] | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [lines, setLines] = useState(true)
  const [grid, setGrid] = useState(true)
  const drag = useRef<{ x: number; y: number; box: Box; scale: number } | null>(null)

  useEffect(() => {
    Promise.all(ids.map((id) => repo.getVariant(id))).then((vs) => {
      const ok = vs.filter((v): v is Variant => !!v)
      setVariants(ok)
      const w = Math.max(...ok.map((v) => v.state.wall.w))
      const h = Math.max(...ok.map((v) => v.state.wall.h))
      const pad = Math.max(w, h) * 0.04
      setBox({ x: -pad, y: -pad, w: w + 2 * pad, h: h + 2 * pad })
    })
  }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!variants || !box) return <div className="loading">Chargement…</div>
  const projectId = variants[0]?.projectId

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const k = Math.exp(e.deltaY * 0.002)
    const fx = (e.clientX - r.left) / r.width
    const fy = (e.clientY - r.top) / r.height
    const w = box.w * k
    const h = box.h * k
    setBox({ x: box.x + (box.w - w) * fx, y: box.y + (box.h - h) * fy, w, h })
  }

  const n = variants.length
  return (
    <div className="compare">
      <header className="project-head">
        <button className="ghost" onClick={() => navigate(projectId ? `/p/${projectId}` : '/')}>← Variantes</button>
        <strong>Comparaison</strong>
        <div className="spacer" />
        <label className="check"><input type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} data-testid="compare-lines" /> Traits</label>
        <label className="check"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grille</label>
        <span className="muted small">Molette : zoom · glisser : déplacer (synchronisés)</span>
      </header>
      <div className={`compare-grid n${n}`}>
        {variants.map((v) => {
          const s = surfaces(v.state)
          return (
            <section key={v.id} className="compare-pane" data-testid="compare-pane">
              <div className="compare-title">
                <strong>{v.name}</strong>
                <button className="ghost small" onClick={() => navigate(`/v/${v.id}`)}>Ouvrir ↗</button>
              </div>
              <div
                className="compare-canvas"
                onWheel={onWheel}
                onPointerDown={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  drag.current = { x: e.clientX, y: e.clientY, box, scale: Math.max(box.w / r.width, box.h / r.height) }
                }}
                onPointerMove={(e) => {
                  const d = drag.current
                  if (!d) return
                  setBox({ ...d.box, x: d.box.x - (e.clientX - d.x) * d.scale, y: d.box.y - (e.clientY - d.y) * d.scale })
                }}
                onPointerUp={() => (drag.current = null)}
              >
                <ViewBoxed box={box}>
                  <DocPreview doc={v.state} showGrid={grid} showLines={lines} className="compare-svg" />
                </ViewBoxed>
              </div>
              <div className="compare-legend">
                {s.colors.map((c) => (
                  <span key={c.colorId}><i style={{ background: c.hex }} />{c.name} {(c.area / 10000).toFixed(2)} m²</span>
                ))}
                {!s.colors.length && <span className="muted">Aucune zone peinte</span>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Applique une même fenêtre (viewBox) au SVG enfant. */
function ViewBoxed({ box, children }: { box: Box; children: React.ReactElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const svg = ref.current?.querySelector('svg')
    if (svg) svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`)
  })
  return (
    <div ref={ref} className="viewboxed">
      {children}
    </div>
  )
}
