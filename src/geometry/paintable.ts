import type { RoomCtx } from '../store/editor'
import type { DocState } from '../model/types'
import { openingRect } from '../room/geometry'
import { getPaper } from './paperScope'

export type WallContext = Pick<RoomCtx, 'openings' | 'masks' | 'seams'>

/** Union bornée au mur : un chevauchement n'est déduit qu'une fois. */
export function excludedArea(doc: DocState, room?: WallContext | null): paper.PathItem | null {
  const P = getPaper()
  let result: paper.PathItem | null = null
  for (const r of [...(room?.masks ?? []), ...(room?.openings ?? []).map((o) => openingRect(o, doc.wall.h))]) {
    const x = Math.max(0, r.x), y = Math.max(0, r.y)
    const w = Math.min(doc.wall.w, r.x + r.w) - x, h = Math.min(doc.wall.h, r.y + r.h) - y
    if (w <= 0 || h <= 0) continue
    const rect = new P.Path.Rectangle({ point: [x, y], size: [w, h], insert: false })
    result = result ? result.unite(rect, { insert: false }) : rect
  }
  return result
}
