import Dexie, { type EntityTable } from 'dexie'
import dexieCloud from 'dexie-cloud-addon'

/** Versions immuables : deux appareils hors ligne ne peuvent pas écraser leur historique. */
export interface CloudCommit {
  id: string
  projectId: string
  parents: string[]
  name: string
  createdAt: number
  payload: Blob | null
  archived?: boolean
}

export class CloudDB extends Dexie {
  commits!: EntityTable<CloudCommit, 'id'>
  constructor(databaseUrl: string) {
    super('betterdraw-sync', { addons: [dexieCloud] })
    this.version(1).stores({ commits: 'id, projectId' })
    this.cloud.configure({ databaseUrl, socialAuth: false, customLoginGui: true })
  }
}
