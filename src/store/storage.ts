import { db } from './db'

// Les patches peuvent remplacer une image entière ou seulement son identifiant.
// Conserver tous leurs textes est volontairement prudent : un faux positif
// garde une image, tandis qu'un faux négatif détruirait un état restaurable.
export function imageReferences(...values: unknown[]): Set<string> {
  const ids = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string') ids.add(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  values.forEach(visit)
  return ids
}

export async function cleanOrphanImages() {
  return db.transaction('rw', db.images, db.variants, db.entries, async () => {
    const refs = imageReferences(await db.variants.toArray(), await db.entries.toArray())
    const candidates = (await db.images.toCollection().primaryKeys()).filter((id) => !refs.has(id))
    let deleted = 0
    for (let i = 0; i < candidates.length; i += 20) {
      const batch = await db.images.bulkGet(candidates.slice(i, i + 20))
      const obsolete = batch.filter((im) => im && (!im.addedAt || im.addedAt < Date.now() - 86400000)).map((im) => im!.id)
      await db.images.bulkDelete(obsolete)
      deleted += obsolete.length
    }
    return deleted
  })
}

export function storageError(error: unknown) {
  const names = new Set<string>()
  const seen = new Set<unknown>()
  function visit(e: unknown) {
    if (!e || typeof e !== 'object' || seen.has(e)) return
    seen.add(e)
    const value = e as { name?: string; inner?: unknown; cause?: unknown; failures?: unknown[] }
    if (value.name) names.add(value.name)
    visit(value.inner)
    visit(value.cause)
    value.failures?.forEach(visit)
  }
  visit(error)
  if ([...names].some((n) => n.includes('Quota'))) return 'Espace de stockage insuffisant. Sauvegardez vos projets en JSON depuis l’accueil, puis supprimez les projets inutiles. Ne videz pas les données du navigateur.'
  if ([...names].some((n) => /Database|OpenFailed|MissingAPI|Version|Security|InvalidState|Unknown|Abort|NotReadable/.test(n))) return 'Stockage local inaccessible. Réessayez dans ce même navigateur avec le stockage autorisé et hors navigation privée. Ne supprimez pas ses données ; conservez vos sauvegardes JSON.'
  return 'Opération impossible. Réessayez ; si le problème persiste, conservez une sauvegarde JSON avant de recharger.'
}

export async function cleanOrphanImagesBestEffort() {
  try { await cleanOrphanImages() }
  catch (e) { console.warn('[betterdraw] Nettoyage des images reporté', e) }
}
