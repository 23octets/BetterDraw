import type { RoomPlan, Variant, Vec } from '../model/types'
import { bounds, outerPts, pointOnWall, wallSeg } from './geometry'

/** Vignette d'une pièce : le plan, chaque mur souligné de la couleur de son fond. */
export function RoomThumb({ room, variants, onOpen, label }: { room: RoomPlan; variants: Variant[]; onOpen?: () => void; label?: string }) {
  const outer = outerPts(room)
  const b = bounds(outer)
  const pad = Math.max(b.w, b.h) * 0.12
  const poly = (ps: Vec[]) => 'M' + ps.map((p) => `${p.x} ${p.y}`).join('L') + 'Z'
  const color = (wallId: string) => [...variants].filter((v) => v.wallId === wallId).sort((a, c) => c.updatedAt - a.updatedAt)[0]?.state.background.hex
  const sw = Math.max(b.w, b.h) * 0.02
  return (
    <div
      className={`thumb-frame room-thumb${onOpen ? ' clickable' : ''}`}
      style={{ aspectRatio: '4 / 3' }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(e) => onOpen && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
    >
      <svg className="thumb-svg" viewBox={`${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} preserveAspectRatio="xMidYMid meet">
        <path d={poly(room.pts)} fill={room.floor} opacity={0.55} />
        {room.walls.map((w, i) => {
          const s = wallSeg(room, i)
          const c = color(w.id)
          if (!c) return null
          const a = pointOnWall(s, 0, sw / 2), z = pointOnWall(s, s.len, sw / 2)
          return <line key={w.id} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke={c} strokeWidth={sw} />
        })}
        <path d={poly(outer) + poly(room.pts)} fillRule="evenodd" fill="#33363b" />
        {room.walls.flatMap((w, i) => {
          const s = wallSeg(room, i)
          return w.openings.map((o) => {
            const p = [pointOnWall(s, o.x), pointOnWall(s, o.x + o.w), pointOnWall(s, o.x + o.w, -room.thickness), pointOnWall(s, o.x, -room.thickness)]
            return <path key={o.id} d={poly(p)} fill={o.kind === 'window' ? '#bcd9ea' : '#f7f4ee'} />
          })
        })}
      </svg>
    </div>
  )
}
