import Dexie, { type EntityTable } from 'dexie'
import type { HistoryEntry, Project, StoredImage, Variant, Wall } from '../model/types'

/**
 * Avant la version 2, un projet sans pièce était un mur seul : ses murs deviennent des murs 2D
 * indépendants. Les murs d'une pièce (y compris ceux retirés du plan) restent tels quels.
 */
export function markStandaloneWalls(project: Pick<Project, 'room'>, walls: Wall[]): Wall[] {
  if (project.room) return walls
  return walls.map((w) => (w.group || w.standalone ? w : { ...w, standalone: true }))
}

export class FrsqueDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  walls!: EntityTable<Wall, 'id'>
  variants!: EntityTable<Variant, 'id'>
  entries!: Dexie.Table<HistoryEntry, [string, number]>
  images!: EntityTable<StoredImage, 'id'>

  // Nom de la base inchangé après le renommage de l'app : le modifier viderait les projets déjà enregistrés.
  constructor(name = 'betterdraw') {
    super(name)
    this.version(1).stores({
      projects: 'id, updatedAt',
      walls: 'id, projectId',
      variants: 'id, projectId, wallId, updatedAt',
      entries: '[variantId+seq], variantId',
      images: 'id',
    })
    this.version(2).stores({}).upgrade(async (tx) => {
      const projects = await tx.table<Project>('projects').toArray()
      const walls = tx.table<Wall>('walls')
      for (const p of projects) {
        if (p.room) continue
        await walls.where('projectId').equals(p.id).modify((w) => {
          if (!w.group) w.standalone = true
        })
      }
    })
  }
}

export const db = new FrsqueDB()
