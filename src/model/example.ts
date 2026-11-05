import { nanoid } from 'nanoid'
import { defaultDoc } from './defaults'
import type { Shape, Vec } from './types'

/** Paysage géométrique : toutes les zones sont réellement éditables. */
export function exampleDoc() {
  const doc = defaultDoc()
  const polygon = (pts: Vec[], closed = true): Shape => ({ id: nanoid(10), pts, segs: pts.slice(closed ? 0 : 1).map(() => ({ t: 'line' })), closed })
  doc.shapes = [
    polygon([{ x: 0, y: 180 }, { x: 80, y: 70 }, { x: 170, y: 180 }], false),
    polygon([{ x: 170, y: 180 }, { x: 235, y: 100 }, { x: 300, y: 180 }], false),
    { id: nanoid(10), pts: [{ x: 0, y: 180 }, { x: 300, y: 180 }], segs: [{ t: 'line' }], closed: false },
    polygon([{ x: 180, y: 40 }, { x: 210, y: 40 }, { x: 210, y: 70 }, { x: 180, y: 70 }]),
  ]
  doc.fills = [
    { seed: { x: 80, y: 140 }, colorId: doc.palette[0].id },
    { seed: { x: 235, y: 150 }, colorId: doc.palette[3].id },
    { seed: { x: 150, y: 220 }, colorId: doc.palette[1].id },
    { seed: { x: 195, y: 55 }, colorId: doc.palette[2].id },
  ].map((f) => ({ ...f, id: nanoid(10) }))
  doc.printCells = ['B3', 'E3']
  return doc
}
