import { nanoid } from 'nanoid'
import { defaultDoc } from '../model/defaults'
import type { DocState, Shape } from '../model/types'
import type { GroupLayout } from './geometry'

/**
 * Dessin initial d'un groupe de murs liés : les dessins des murs sont recopiés côte à côte dans le
 * déroulé. Le dessin est continu : les jonctions entre murs ne limitent pas les zones à peindre.
 */
export function mergeDocs(layout: GroupLayout, height: number, docs: (DocState | null)[]): DocState {
  const first = docs.find((d): d is DocState => !!d)
  const out: DocState = first ? structuredClone({ ...first, shapes: [], fills: [], images: [], printCells: [] }) : defaultDoc()
  out.wall = { w: Math.max(1, layout.width), h: height }
  out.printCells = []
  const byHex = new Map(out.palette.map((c) => [c.hex.toLowerCase(), c.id]))
  layout.segs.forEach((seg, n) => {
    const doc = docs[n]
    if (!doc) return
    // couleurs : même teinte = même couleur de palette
    const colorMap = new Map<string, string>()
    for (const c of doc.palette) {
      const hit = byHex.get(c.hex.toLowerCase())
      if (hit) colorMap.set(c.id, hit)
      else {
        const id = out.palette.some((p) => p.id === c.id) ? nanoid(8) : c.id
        out.palette.push({ ...c, id })
        byHex.set(c.hex.toLowerCase(), id)
        colorMap.set(c.id, id)
      }
    }
    const dx = seg.x
    const mv = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y })
    for (const s of doc.shapes) {
      out.shapes.push({
        ...s,
        id: nanoid(10),
        pts: s.pts.map(mv),
        segs: s.segs.map((g) => (g.t === 'cubic' ? { ...g, c1: mv(g.c1), c2: mv(g.c2) } : g)),
      })
    }
    for (const f of doc.fills) out.fills.push({ id: nanoid(10), seed: mv(f.seed), colorId: colorMap.get(f.colorId) ?? f.colorId })
    for (const im of doc.images) out.images.push({ ...im, id: nanoid(10), x: im.x + dx })
  })
  return out
}

/**
 * Traits verticaux pleine hauteur posés exactement sur une jonction entre murs liés
 * (ajoutés automatiquement par les premières versions : ils coupaient les zones à peindre).
 */
export function seamLineIds(doc: DocState, edges: number[]): string[] {
  const H = doc.wall.h
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05
  return doc.shapes
    .filter((s: Shape) => {
      if (s.closed || s.pts.length !== 2 || s.segs[0]?.t !== 'line') return false
      const [a, b] = s.pts
      if (!near(a.x, b.x) || !edges.some((x) => near(x, a.x))) return false
      return (near(a.y, 0) && near(b.y, H)) || (near(a.y, H) && near(b.y, 0))
    })
    .map((s) => s.id)
}
