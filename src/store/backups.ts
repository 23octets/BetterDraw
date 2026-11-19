import type { Project, Variant } from '../model/types'

/**
 * Date de la dernière copie de secours téléchargée, par projet.
 * Conservée dans localStorage : c'est un simple repère d'affichage, pas une donnée du projet.
 */
const KEY = 'frsque:copies'

export type BackupState = 'ok' | 'old' | 'none'

export function backupTimes(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => typeof t === 'number')) as Record<string, number>
  } catch { return {} }
}

function write(times: Record<string, number>) {
  try { localStorage.setItem(KEY, JSON.stringify(times)) } catch { /* stockage refusé : l'état reste « aucune copie » */ }
}

export function markBackedUp(ids: string[], at = Date.now()) {
  const times = backupTimes()
  for (const id of ids) times[id] = at
  write(times)
}

export function forgetBackup(id: string) {
  const times = backupTimes()
  delete times[id]
  write(times)
}

/** « old » dès qu'une modification du projet ou d'une de ses variantes est postérieure à la copie. */
export function backupState(project: Pick<Project, 'id' | 'updatedAt'>, variants: Pick<Variant, 'updatedAt'>[], times: Record<string, number>): BackupState {
  const at = times[project.id]
  if (!at) return 'none'
  const changed = Math.max(project.updatedAt, ...variants.map((v) => v.updatedAt))
  return changed > at ? 'old' : 'ok'
}

export const BACKUP_LABEL: Record<BackupState, string> = {
  ok: 'Copie de secours à jour',
  old: 'Modifié depuis la dernière copie',
  none: 'Aucune copie de secours',
}
