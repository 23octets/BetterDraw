import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OpeningKind, RoomPlan, Vec } from '../model/types'
import { bounds, outerPts, pointOnWall, wallSeg, clampOpening, openingAt, isConvexCorner, defaultNotchCorner, moveCorner, type GrowSide } from './geometry'
import { Icon } from '../ui/icons'

export type RoomSelection =
  | { kind: 'wall'; i: number }
  | { kind: 'opening'; i: number; id: string }
  | { kind: 'corner'; j: number }
  | null

interface View {
  zoom: number
  panX: number
  panY: number
}

const GRID = 5
const fmt = (x: number) => (Math.round(x * 10) / 10).toLocaleString('fr-FR')

function fit(room: RoomPlan, size: { w: number; h: number }): View {
  const b = bounds(outerPts(room))
  const m = 80
  const zoom = Math.max(0.05, Math.min((size.w - m * 2) / Math.max(b.w, 1), (size.h - m * 2) / Math.max(b.h, 1)))
  return { zoom, panX: (size.w - b.w * zoom) / 2 - b.x * zoom, panY: (size.h - b.h * zoom) / 2 - b.y * zoom }
}

type Drag =
  | { kind: 'corner'; j: number; start: RoomPlan; moved: boolean }
  | { kind: 'opening'; i: number; id: string; grab: number; start: RoomPlan; moved: boolean }
  | { kind: 'pan'; x: number; y: number; px: number; py: number }

/**
 * Plan de la pièce vu de dessus : angles déplaçables (aimantés sur la grille et sur
 * l'alignement des autres angles), murs et ouvertures sélectionnables.
 */
export function PlanEditor(props: {
  room: RoomPlan
  names: string[]
  colors: (string | null)[]
  selection: RoomSelection
  /** Sens d'agrandissement du mur sélectionné (flèches sur le plan). */
  grow: GrowSide
  /** Mode « lier des murs » : identifiants des murs cochés (un clic sur un mur le coche / décoche). */
  linking: string[] | null
  onToggleLink: (i: number) => void
  onSelect: (s: RoomSelection) => void
  onPreview: (r: RoomPlan | null) => void
  onCommit: (r: RoomPlan, label: string) => void
  onSplit: (i: number, at: Vec) => void
  /** Pose une porte ou une fenêtre sur le mur i, centrée à u cm de sa gauche. */
  onPlace: (i: number, kind: OpeningKind, u: number, free: boolean) => void
  /** Décroché sur l'angle j (un rectangle devient un L). */
  onNotch: (j: number) => void
}) {
  const { room, selection } = props
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 })
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const drag = useRef<Drag | null>(null)
  const [tool, setTool] = useState<OpeningKind | null>(null)
  const [hover, setHover] = useState<{ i: number; u: number; free: boolean } | null>(null)
  const fitted = useRef(false)
  const roomRef = useRef(room)
  roomRef.current = room

  useLayoutEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
      if (r.width > 0 && !fitted.current) {
        fitted.current = true
        setView(fit(roomRef.current, { w: r.width, h: r.height }))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = ref.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setView((v) => {
        if (e.ctrlKey || e.metaKey) {
          const sx = e.clientX - r.left, sy = e.clientY - r.top
          const zoom = Math.max(0.05, Math.min(20, v.zoom * Math.exp(-e.deltaY * 0.01)))
          return { zoom, panX: sx - ((sx - v.panX) / v.zoom) * zoom, panY: sy - ((sy - v.panY) / v.zoom) * zoom }
        }
        return { ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!tool) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTool(null)
        setHover(null)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [tool])

  /** Mur visé (mur ou ouverture existante) et position le long de ce mur. */
  const wallUnder = (e: React.PointerEvent): { i: number; u: number } | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-hit=wall],[data-hit=opening]') as HTMLElement | null
    if (!el) return null
    const i = +el.dataset.i!
    const s = wallSeg(room, i)
    const w = toWorld(e)
    return { i, u: (w.x - s.a.x) * s.dir.x + (w.y - s.a.y) * s.dir.y }
  }

  const toWorld = (e: React.PointerEvent | React.MouseEvent): Vec => {
    const r = ref.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - view.panX) / view.zoom, y: (e.clientY - r.top - view.panY) / view.zoom }
  }

  function snapCorner(p: Vec, j: number, free: boolean): Vec {
    if (free) {
      setGuides({})
      return { x: Math.round(p.x), y: Math.round(p.y) }
    }
    const tol = 9 / view.zoom
    let x = Math.round(p.x / GRID) * GRID
    let y = Math.round(p.y / GRID) * GRID
    const g: { x?: number; y?: number } = {}
    let bx = tol, by = tol
    room.pts.forEach((q, k) => {
      if (k === j) return
      if (Math.abs(q.x - p.x) < bx) { bx = Math.abs(q.x - p.x); x = q.x; g.x = q.x }
      if (Math.abs(q.y - p.y) < by) { by = Math.abs(q.y - p.y); y = q.y; g.y = q.y }
    })
    setGuides(g)
    return { x, y }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (props.linking && e.button === 0) {
      const t = (e.target as Element).closest('[data-hit=wall],[data-hit=opening]') as HTMLElement | null
      if (t) {
        props.onToggleLink(+t.dataset.i!)
        return
      }
    }
    if (tool && e.button === 0) {
      const h = wallUnder(e)
      if (h) {
        props.onPlace(h.i, tool, h.u, e.altKey)
        setTool(null)
        setHover(null)
        return
      }
    }
    ref.current!.setPointerCapture(e.pointerId)
    const target = (e.target as Element).closest('[data-hit]') as HTMLElement | null
    if (e.button === 1 || e.button === 2 || !target) {
      if (!target && e.button === 0) props.onSelect(null)
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, px: view.panX, py: view.panY }
      return
    }
    const hit = target.dataset.hit!
    if (hit === 'corner') {
      const j = +target.dataset.j!
      props.onSelect({ kind: 'corner', j })
      drag.current = { kind: 'corner', j, start: room, moved: false }
    } else if (hit === 'opening') {
      const i = +target.dataset.i!
      const id = target.dataset.id!
      const o = room.walls[i].openings.find((x) => x.id === id)!
      const s = wallSeg(room, i)
      const w = toWorld(e)
      const u = (w.x - s.a.x) * s.dir.x + (w.y - s.a.y) * s.dir.y
      props.onSelect({ kind: 'opening', i, id })
      drag.current = { kind: 'opening', i, id, grab: u - o.x, start: room, moved: false }
    } else if (hit === 'wall') {
      props.onSelect({ kind: 'wall', i: +target.dataset.i! })
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) {
      if (tool) {
        const h = wallUnder(e)
        setHover(h && { ...h, free: e.altKey })
      }
      return
    }
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, panX: d.px + e.clientX - d.x, panY: d.py + e.clientY - d.y }))
      return
    }
    const w = toWorld(e)
    if (d.kind === 'corner') {
      d.moved = true
      const p = snapCorner(w, d.j, e.altKey)
      props.onPreview(moveCorner(d.start, d.j, p))
    } else {
      d.moved = true
      const s = wallSeg(d.start, d.i)
      const u = (w.x - s.a.x) * s.dir.x + (w.y - s.a.y) * s.dir.y - d.grab
      const x = e.altKey ? Math.round(u) : Math.round(u / GRID) * GRID
      const walls = d.start.walls.map((rw, k) =>
        k !== d.i ? rw : { ...rw, openings: rw.openings.map((o) => (o.id === d.id ? clampOpening({ ...o, x }, s.len, d.start.height) : o)) },
      )
      props.onPreview({ ...d.start, walls })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current
    drag.current = null
    setGuides({})
    if (!d || d.kind === 'pan' || !d.moved) {
      props.onPreview(null)
      return
    }
    const w = toWorld(e)
    if (d.kind === 'corner') {
      const p = snapCorner(w, d.j, e.altKey)
      setGuides({})
      props.onCommit(moveCorner(d.start, d.j, p), 'Déplacer un angle')
    } else {
      const s = wallSeg(d.start, d.i)
      const u = (w.x - s.a.x) * s.dir.x + (w.y - s.a.y) * s.dir.y - d.grab
      const x = e.altKey ? Math.round(u) : Math.round(u / GRID) * GRID
      const walls = d.start.walls.map((rw, k) =>
        k !== d.i ? rw : { ...rw, openings: rw.openings.map((o) => (o.id === d.id ? clampOpening({ ...o, x }, s.len, d.start.height) : o)) },
      )
      props.onCommit({ ...d.start, walls }, 'Déplacer une ouverture')
    }
    props.onPreview(null)
  }

  const notchTarget = selection?.kind === 'corner' && isConvexCorner(room, selection.j) ? selection.j : defaultNotchCorner(room)
  const outer = outerPts(room)
  const k = room.pts.length
  const poly = (ps: Vec[]) => 'M' + ps.map((p) => `${p.x} ${p.y}`).join('L') + 'Z'
  const px = 1 / view.zoom
  const b = bounds(outer)
  // grille sur toute la zone visible
  const gridStep = view.zoom > 1.2 ? 10 : view.zoom > 0.3 ? 50 : 100
  const vx0 = -view.panX / view.zoom, vy0 = -view.panY / view.zoom
  const vx1 = (size.w - view.panX) / view.zoom, vy1 = (size.h - view.panY) / view.zoom
  const g0 = { x: Math.floor(vx0 / gridStep) * gridStep, y: Math.floor(vy0 / gridStep) * gridStep }
  const gridLines: React.ReactNode[] = []
  for (let x = g0.x; x <= vx1; x += gridStep) gridLines.push(<line key={`x${x}`} x1={x} y1={vy0} x2={x} y2={vy1} className={x % 50 === 0 ? 'major' : ''} />)
  for (let y = g0.y; y <= vy1; y += gridStep) gridLines.push(<line key={`y${y}`} x1={vx0} y1={y} x2={vx1} y2={y} className={y % 50 === 0 ? 'major' : ''} />)

  return (
    <div className={`plan-editor${tool ? ' placing' : ''}`}>
      <div className="plan-tools hud-pill" role="toolbar" aria-label="Ajouter au plan">
        <button className={tool === 'door' ? 'on' : ''} onClick={() => setTool(tool === 'door' ? null : 'door')} data-testid="tool-door" title="Ajouter une porte : clique ensuite sur un mur">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M2 14H14M4 14V4M4 4A10 10 0 0 1 14 14" /></svg> Porte
        </button>
        <button className={tool === 'window' ? 'on' : ''} onClick={() => setTool(tool === 'window' ? null : 'window')} data-testid="tool-window" title="Ajouter une fenêtre : clique ensuite sur un mur">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M1 6H15M1 10H15M3 6V10M13 6V10" /></svg> Fenêtre
        </button>
        <span className="sep" />
        <button onClick={() => props.onNotch(notchTarget)} disabled={notchTarget < 0} data-testid="tool-notch" title={selection?.kind === 'corner' ? 'Entailler l’angle sélectionné' : 'Entailler un angle de la pièce pour faire un L (ou sélectionne d’abord un angle)'}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M2 2H14V8H8V14H2Z" /></svg> Décroché en L
        </button>
      </div>
      {tool && <div className="plan-placing-tip" data-testid="placing-tip">Clique sur un mur pour placer la {tool === 'door' ? 'porte' : 'fenêtre'} · <kbd className="key small">Échap</kbd> annuler</div>}
      <svg
        ref={ref}
        className="plan-svg"
        data-testid="plan"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={(e) => {
          // la capture du pointeur redirige le double-clic vers le svg : on retrouve l'élément visé
          const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-hit=wall]') as HTMLElement | null
          if (t) props.onSplit(+t.dataset.i!, toWorld(e))
        }}
      >
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          <g className="plan-grid">{gridLines}</g>
          <path d={poly(room.pts)} className="plan-floor" />
          <path d={poly(outer) + poly(room.pts)} className="plan-walls" fillRule="evenodd" />
          {room.pts.map((_, i) => {
            const s = wallSeg(room, i)
            const on = !props.linking && (selection?.kind === 'wall' || selection?.kind === 'opening') && selection.i === i
            const linkCls = props.linking ? (props.linking.includes(room.walls[i].id) ? ' linked' : ' linking') : ''
            const grouped = !props.linking && room.groups?.some((g) => g.walls.includes(room.walls[i].id))
            const ga = pointOnWall(s, 0, 9 * px), gb = pointOnWall(s, s.len, 9 * px)
            const quad = [s.a, s.b, outer[(i + 1) % k], outer[i]]
            const color = props.colors[i]
            const ia = pointOnWall(s, 0, 3 * px), ib = pointOnWall(s, s.len, 3 * px)
            return (
              <g key={room.walls[i].id}>
                <path d={poly(quad)} className={`plan-wall-hit${on ? ' on' : ''}${linkCls}`} data-hit="wall" data-i={i} data-testid={`plan-wall-${i}`} />
                {grouped && <line x1={ga.x} y1={ga.y} x2={gb.x} y2={gb.y} strokeWidth={1.5 * px} className="plan-group-line" data-testid={`plan-linked-${i}`} />}
                {color && <line x1={ia.x} y1={ia.y} x2={ib.x} y2={ib.y} stroke={color} strokeWidth={5 * px} className="plan-paint" />}
              </g>
            )
          })}
          {room.walls.map((rw, i) => {
            const s = wallSeg(room, i)
            const t = room.thickness
            return rw.openings.map((o) => {
              const on = selection?.kind === 'opening' && selection.id === o.id
              const p0 = pointOnWall(s, o.x), p1 = pointOnWall(s, o.x + o.w)
              const q0 = pointOnWall(s, o.x, -t), q1 = pointOnWall(s, o.x + o.w, -t)
              const ang = (Math.atan2(s.dir.y, s.dir.x) * 180) / Math.PI
              return (
                <g key={o.id} className={`plan-opening ${o.kind}${on ? ' on' : ''}`} data-hit="opening" data-i={i} data-id={o.id} data-testid={`plan-opening-${o.kind}`}>
                  <path d={poly([p0, p1, q1, q0])} className="plan-opening-gap" />
                  {o.kind === 'window' ? (
                    <>
                      <line x1={pointOnWall(s, o.x, -t * 0.4).x} y1={pointOnWall(s, o.x, -t * 0.4).y} x2={pointOnWall(s, o.x + o.w, -t * 0.4).x} y2={pointOnWall(s, o.x + o.w, -t * 0.4).y} />
                      <line x1={pointOnWall(s, o.x, -t * 0.6).x} y1={pointOnWall(s, o.x, -t * 0.6).y} x2={pointOnWall(s, o.x + o.w, -t * 0.6).x} y2={pointOnWall(s, o.x + o.w, -t * 0.6).y} />
                    </>
                  ) : (
                    <>
                      {/* vantail ouvert à 90° vers l'intérieur et son débattement */}
                      <line x1={p0.x} y1={p0.y} x2={pointOnWall(s, o.x, o.w).x} y2={pointOnWall(s, o.x, o.w).y} />
                      <path d={`M${pointOnWall(s, o.x, o.w).x} ${pointOnWall(s, o.x, o.w).y}A${o.w} ${o.w} ${ang} 0 0 ${p1.x} ${p1.y}`} className="swing" />
                    </>
                  )}
                </g>
              )
            })
          })}
          {tool && hover && room.walls[hover.i] && (() => {
            const s = wallSeg(room, hover.i)
            const o = openingAt(tool, hover.u, s.len, room.height, hover.free)
            const t = room.thickness
            return <path d={poly([pointOnWall(s, o.x, 2 * px), pointOnWall(s, o.x + o.w, 2 * px), pointOnWall(s, o.x + o.w, -t - 2 * px), pointOnWall(s, o.x, -t - 2 * px)])} className={`plan-ghost ${tool}`} data-testid="plan-ghost" />
          })()}
          {guides.x !== undefined && <line x1={guides.x} y1={b.y - 1000} x2={guides.x} y2={b.y + b.h + 1000} className="plan-guide" />}
          {guides.y !== undefined && <line x1={b.x - 1000} y1={guides.y} x2={b.x + b.w + 1000} y2={guides.y} className="plan-guide" />}
        </g>
        {/* libellés et poignées en coordonnées écran (taille constante) */}
        {room.pts.map((_, i) => {
          const s = wallSeg(room, i)
          const m = pointOnWall(s, s.len / 2, 26 / view.zoom)
          const sx = m.x * view.zoom + view.panX, sy = m.y * view.zoom + view.panY
          let ang = (Math.atan2(s.dir.y, s.dir.x) * 180) / Math.PI
          if (ang > 90) ang -= 180
          if (ang < -90) ang += 180
          if (s.len * view.zoom < 50) return null
          return (
            <g key={`l${room.walls[i].id}`} transform={`translate(${sx} ${sy}) rotate(${ang})`} className="plan-label" data-testid={`plan-label-${i}`}>
              {room.walls[i]?.locked && (
                <g transform="translate(-5 -26)" className="plan-label-lock" data-testid={`plan-lock-${i}`}>
                  <rect x={0} y={4} width={10} height={7} rx={1.5} />
                  <path d="M2.5 4V2.5a2.5 2.5 0 0 1 5 0V4" />
                </g>
              )}
              <text y={-2} textAnchor="middle" className="plan-label-name">{props.names[i] ?? `Mur ${i + 1}`}</text>
              <text y={12} textAnchor="middle" className="plan-label-len">{fmt(s.len)} cm</text>
            </g>
          )
        })}
        {/* sens d'agrandissement du mur sélectionné */}
        {(selection?.kind === 'wall' || selection?.kind === 'opening') && room.walls[selection.i] && !room.walls[selection.i].locked && (() => {
          const s = wallSeg(room, selection.i)
          const ends: [Vec, number][] = []
          if (props.grow !== 'left') ends.push([s.b, 1])
          if (props.grow !== 'right') ends.push([s.a, -1])
          return ends.map(([p, sg]) => {
            const sx = p.x * view.zoom + view.panX, sy = p.y * view.zoom + view.panY
            const dx = s.dir.x * sg, dy = s.dir.y * sg
            // décalé vers l'intérieur pour ne pas masquer l'angle
            const ox = sx + s.n.x * 14, oy = sy + s.n.y * 14
            const x1 = ox + dx * 8, y1 = oy + dy * 8, x2 = ox + dx * 30, y2 = oy + dy * 30
            const hx = -dy, hy = dx
            return (
              <g key={sg} className="plan-grow" data-testid={`plan-grow-${sg > 0 ? 'right' : 'left'}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} />
                <path d={`M${x2 + dx * 6} ${y2 + dy * 6}L${x2 + hx * 5} ${y2 + hy * 5}L${x2 - hx * 5} ${y2 - hy * 5}Z`} />
              </g>
            )
          })
        })()}
        {room.pts.map((p, j) => {
          const on = selection?.kind === 'corner' && selection.j === j
          return (
            <circle key={`c${j}`} cx={p.x * view.zoom + view.panX} cy={p.y * view.zoom + view.panY} r={on ? 7 : 6} className={`plan-corner${on ? ' on' : ''}`} data-hit="corner" data-j={j} data-testid={`plan-corner-${j}`} />
          )
        })}
      </svg>
      <div className="plan-hud hud-pill">
        <button className="icon-btn" onClick={() => setView(fit(room, size))} title="Ajuster à l’écran" data-testid="plan-fit"><Icon name="fit" /></button>
      </div>
      <p className="plan-help">Glisser un angle ou une ouverture : déplacer (<kbd className="key small">⌥</kbd> sans aimant) · double-clic sur un mur : ajouter un angle</p>
    </div>
  )
}
