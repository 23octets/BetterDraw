import { useEffect, useMemo, useState } from 'react'
import type { Variant } from '../model/types'
import { copyFresco, listFrescoSources, type FrescoSource } from '../store/rooms'
import { storageError } from '../store/storage'
import { useModal } from './useModal'
import { Thumb } from './DocPreview'
import { Icon } from './icons'

function byProject(list: FrescoSource[]) {
  const out = new Map<string, [FrescoSource['project'], FrescoSource[]]>()
  for (const s of list) {
    const e = out.get(s.project.id) ?? [s.project, []]
    e[1].push(s)
    out.set(s.project.id, e)
  }
  return [...out.values()]
}

/**
 * Choix d'une fresque d'un autre mur (de ce projet ou d'un autre) à copier dans le mur cible.
 * La copie devient une nouvelle variante du mur cible : rien n'est écrasé.
 */
export function FrescoImportDialog({ target, targetName, onClose, onDone }: {
  target: { projectId: string; wallId: string; size?: { w: number; h: number } }
  targetName: string
  onClose: () => void
  onDone: (v: Variant) => void
}) {
  useModal('[data-testid=fresco-import]', onClose)
  const [sources, setSources] = useState<FrescoSource[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    listFrescoSources()
      .then((all) => setSources(all.filter((s) => s.wall.id !== target.wallId)))
      .catch((e) => setError(storageError(e)))
  }, [target.wallId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!sources || !q) return sources
    return sources.filter((s) => `${s.project.name} ${s.wall.name} ${s.variants.map((v) => v.name).join(' ')}`.toLowerCase().includes(q))
  }, [sources, query])

  const pick = async (v: Variant) => {
    setBusy(true)
    try {
      onDone(await copyFresco(v.id, target))
    } catch (e) {
      setError(storageError(e))
      setBusy(false)
    }
  }

  const size = target.size
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal fresco-import" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Importer une fresque" data-testid="fresco-import">
        <header className="modal-head">
          <strong>Importer une fresque dans {targetName}</strong>
          <div className="spacer" />
          <button className="icon-btn ghost" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        </header>
        <div className="modal-pad">
          <p className="hint">
            La fresque choisie est <strong>copiée</strong> comme nouvelle variante de ce mur ; l’original ne change pas.
            {size ? ` Le mur garde sa taille (${size.w} × ${size.h} cm) : le dessin est posé au sol, contre le coin gauche.` : ' Le mur prend la taille de la fresque copiée.'}
          </p>
          <input type="search" placeholder="Filtrer par projet, mur ou variante" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filtrer les fresques" data-testid="fresco-filter" />
          {error && <p className="hint warn" role="alert">{error}</p>}
          {shown === null ? <p className="muted">Chargement…</p> : shown.length === 0 ? (
            <p className="muted" data-testid="fresco-empty">Aucune autre fresque à importer.</p>
          ) : (
            <div className="fresco-sources">
              {byProject(shown).map(([project, list]) => (
                <section key={project.id} className="fresco-source" data-testid="fresco-source">
                  <h4>{project.name}</h4>
                  <ul className="fresco-variants">
                    {list.flatMap((s) => s.variants.map((v) => (
                      <li key={v.id}>
                        <button className="fresco-pick" disabled={busy} onClick={() => pick(v)} data-testid="fresco-pick" title={`Copier « ${v.name} » de ${s.wall.name} (${v.state.wall.w} × ${v.state.wall.h} cm) dans ${targetName}`}>
                          <Thumb doc={v.state} />
                          <span className="fresco-name">{s.wall.name}{s.wall.standalone && !s.wall.name.includes('2D') ? ' (2D)' : ''}</span>
                          <span className="muted small fresco-meta">{v.name} · {v.state.wall.w} × {v.state.wall.h} cm</span>
                        </button>
                      </li>
                    )))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
