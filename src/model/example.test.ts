import { expect, it } from 'vitest'
import { exampleDoc } from './example'
import { resolveFills } from '../store/fills'
import { gridLayout } from '../geometry/grid'

it('propose quatre zones peintes distinctes et des cases imprimables', () => {
  const doc = exampleDoc()
  const fills = resolveFills(doc)
  expect(fills).toHaveLength(4)
  expect(new Set(fills.map((f) => f.hex)).size).toBe(4)
  const cells = gridLayout(doc.wall, doc.grid).cells.map((c) => c.id)
  expect(doc.printCells.every((id) => cells.includes(id))).toBe(true)
  expect(exampleDoc().shapes[0].id).not.toBe(doc.shapes[0].id)
})
