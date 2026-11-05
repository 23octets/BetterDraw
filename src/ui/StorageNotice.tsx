import { useEffect, useState } from 'react'
import { cleanOrphanImages, storageError } from '../store/storage'

export function StorageNotice({ revision }: { revision?: string }) {
  const [space, setSpace] = useState('')
  const [message, setMessage] = useState('')
  async function estimate() {
    try {
      const s = await navigator.storage?.estimate?.()
      setSpace(s?.usage === undefined ? 'Mesure de l’espace indisponible.' : `Espace utilisé par ce site : ${(s.usage / 1048576).toFixed(1)} Mo${s.quota ? ` sur ${(s.quota / 1048576).toFixed(0)} Mo` : ''} (estimation).`)
    } catch { setSpace('Mesure de l’espace indisponible.') }
  }
  useEffect(() => { void estimate() }, [revision])
  return <section className="storage-notice">
    <p>Vos projets restent uniquement dans ce navigateur, sur cet appareil (IndexedDB). Effacer ses données efface aussi vos projets.</p>
    <p>Pensez à télécharger régulièrement une sauvegarde JSON, surtout après une séance de dessin. Elle contient les variantes, l’historique et les images ; vous pouvez la réimporter depuis l’accueil.</p>
    <p>{space}</p>
    {navigator.storage?.persist && <button onClick={async () => {
      try {
        setMessage(await navigator.storage.persist() ? 'Stockage persistant accordé. Cela ne remplace pas une sauvegarde JSON et ne protège pas d’un effacement manuel.' : 'Protection non accordée par le navigateur. Gardez une sauvegarde JSON.')
      } catch { setMessage('Protection indisponible. Gardez une sauvegarde JSON.') }
    }}>Demander la protection du stockage</button>}
    <button onClick={async () => {
      try { setMessage(`${await cleanOrphanImages()} image(s) inutilisée(s) supprimée(s). Les images récentes sont conservées pendant 24 h par précaution.`); await estimate() }
      catch (e) { setMessage(storageError(e)) }
    }}>Libérer les images inutilisées</button>
    {message && <p role="status">{message}</p>}
  </section>
}
