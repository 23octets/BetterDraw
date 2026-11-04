import Dexie, { type EntityTable } from 'dexie'
import type { HistoryEntry, Project, StoredImage, Variant, Wall } from '../model/types'

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
  }
}

export const db = new FrsqueDB()
