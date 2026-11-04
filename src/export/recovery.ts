import { useEditor } from '../store/editor'
import type { ProjectFile } from './project'
import { rescueProject } from '../store/rescue'

/** Snapshot indépendant : l’historique durable ne décrit pas les changements en mémoire. */
export async function recoveryFile(): Promise<ProjectFile> {
  const { variant, doc } = useEditor.getState()
  if (!variant) throw new Error('Aucun dessin en mémoire.')
  const { data, warning } = await rescueProject(variant, doc, null)
  if (warning) data.warnings = [...new Set([...(data.warnings ?? []), warning])]
  return data
}

export async function downloadRecovery() {
  const file = await recoveryFile()
  if (file.warnings?.length && !window.confirm(file.warnings.join('\n') + '\nTélécharger cette sauvegarde incomplète ?')) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'betterdraw-secours.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
