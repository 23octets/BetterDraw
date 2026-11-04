import { useEffect, useState } from 'react'
import { useEditor, flushPersistence, requireSaved } from '../store/editor'
import * as repo from '../store/repo'
import type { Variant } from '../model/types'
import { navigate } from './router'
import { Thumb } from './DocPreview'
import { Icon } from './icons'
import { surfaces } from '../store/fills'

/** Liste des variantes du projet, affichée par-dessus l'éditeur. */
export function VariantsOverlay({ onClose }: { onClose: () => void }) {
  const current = useEditor((s) => s.variant)!
  const blocked = useEditor((s) => !!s.saveError || !!s.saving)
  const doc = useEditor((s) => s.doc)
  const room = useEditor((s) => s.room)
  const [list, setList] = useState<Variant[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])

  const refresh = async () => {
    await flushPersistence()
    setList((await repo.listVariants(current.projectId)).filter((v) => v.wallId === current.wallId))
  }
  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [onClose])

  const byId = new Map((list ?? []).map((v) => [v.id, v]))
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]))
  const open = (id: string) => {
    onClose()
    if (id !== current.id) navigate(`/v/${id}`)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal variants-overlay" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Variantes" data-testid="variants-overlay">
        <header className="modal-head">
          <strong>Variantes du projet</strong>
          <span className="muted small" style={{ marginLeft: 10 }}>{list ? `${list.length} variante${list.length > 1 ? 's' : ''}` : ''}</span>
          <div className="spacer" />
          <span className="muted small">{picked.length ? `${picked.length} sélectionnée${picked.length > 1 ? 's' : ''}` : 'Coche 2 à 4 variantes pour les comparer'}</span>
          <button className="primary" disabled={picked.length < 2} data-testid="compare" onClick={() => navigate(`/compare/${picked.join(',')}`)}>
            <Icon name="compare" size={15} /> Comparer
          </button>
          <button className="icon-btn ghost" onClick={onClose} aria-label="Fermer" data-testid="close-variants"><Icon name="close" /></button>
        </header>
        <div className="variants-body">
          <ul className="card-grid">
            <li className="card new-variant">
              <button
                className="new-variant-btn"
                disabled={blocked} data-testid="snapshot"
                onClick={async () => {
                  if (!await requireSaved()) return
                  const nv = await repo.snapshotVariant(current.id)
                  onClose()
                  navigate(`/v/${nv.id}`)
                  setTimeout(() => useEditor.getState().flash(`${nv.name} créée : copie de ${current.name}, à modifier librement`), 50)
                }}
              >
                <span className="nv-icon"><Icon name="plus" size={26} /></span>
                <strong>Nouvelle variante</strong>
                <span>Copie de « {current.name} » dans son état actuel, pour essayer une autre idée sans toucher à l’original.</span>
              </button>
            </li>
            {(list ?? []).map((v) => {
              const state = v.id === current.id ? doc : v.state
              const parent = v.parentId ? byId.get(v.parentId) : undefined
              const on = picked.includes(v.id)
              const colors = surfaces(state, room).colors
              return (
                <li key={v.id} className={`card variant-card${on ? ' picked' : ''}${v.id === current.id ? ' current' : ''}`} data-testid="variant-card">
                  <Thumb doc={state} onOpen={() => open(v.id)} label={`Ouvrir ${v.name}`}>
                    <label className={`pick-badge${on ? ' on' : ''}`} onClick={(e) => e.stopPropagation()} title="Sélectionner pour comparer">
                      <input type="checkbox" checked={on} onChange={() => toggle(v.id)} data-testid="pick-variant" />
                    </label>
                    {v.id === current.id && <span className="current-badge">En cours</span>}
                  </Thumb>
                  <div className="card-body">
                    <strong className="card-title">{v.id === current.id ? current.name : v.name}</strong>
                    <span className="card-meta">{v.parentId ? `Issue de ${parent?.name ?? 'une variante supprimée'} (état #${v.parentSeq})` : 'Dessin d’origine'}</span>
                    <span className="swatches">
                      {colors.map((c) => <span key={c.colorId} className="mini-swatch" style={{ background: c.hex }} title={`${c.name} · ${(c.area / 10000).toFixed(2)} m²`} />)}
                    </span>
                  </div>
                  <div className="card-actions">
                    <button className="primary small" onClick={() => open(v.id)} disabled={v.id === current.id}>{v.id === current.id ? 'Ouverte' : 'Ouvrir'}</button>
                    <button className="small" disabled={blocked} onClick={async () => { if (!await requireSaved()) return; await repo.snapshotVariant(v.id); refresh() }} data-testid="snapshot-from-card">
                      <Icon name="copy" size={14} /> Dupliquer
                    </button>
                    <div className="spacer" />
                    <button className="icon-btn ghost small danger" disabled={(list?.length ?? 0) <= 1 || v.id === current.id} title={v.id === current.id ? 'Impossible de supprimer la variante ouverte' : 'Supprimer la variante'} aria-label={`Supprimer ${v.name}`}
                      onClick={async () => {
                        if (!confirm(`Supprimer « ${v.name} » et son historique ?`)) return
                        await repo.deleteVariant(v.id)
                        setPicked((p) => p.filter((x) => x !== v.id))
                        refresh()
                      }}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
