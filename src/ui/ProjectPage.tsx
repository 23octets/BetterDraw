import { storageError } from '../store/storage'
import { useEffect, useState } from 'react'
import * as repo from '../store/repo'
import type { Project, Variant } from '../model/types'
import { navigate } from './router'
import { Thumb } from './DocPreview'
import { Icon } from './icons'
import { TextField } from './fields'
import { surfaces } from '../store/fills'

export function ProjectPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined)
  const [variants, setVariants] = useState<Variant[]>([])
  const [picked, setPicked] = useState<string[]>([])

  const refresh = async () => {
    const p = await repo.getProject(projectId)
    setProject(p ?? null)
    setVariants(await repo.listVariants(projectId))
  }
  useEffect(() => {
    refresh()
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (project === undefined) return <div className="loading">Chargement…</div>
  if (project === null)
    return (
      <div className="missing">
        <p>Projet introuvable.</p>
        <button onClick={() => navigate('/')}>Retour</button>
      </div>
    )

  const byId = new Map(variants.map((v) => [v.id, v]))
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]))

  return (
    <div className="project-page">
      <header className="project-head">
        <button className="ghost" onClick={() => navigate('/')}><Icon name="arrowLeft" size={15} /> Projets</button>
        <TextField className="project-title" value={project.name} testId="project-title" onCommit={async (name) => {
          try { await repo.renameProject(project.id, name) } catch (e) { alert(storageError(e)); return }
          refresh()
        }} />
        <span className="muted">{variants.length} variante{variants.length > 1 ? 's' : ''}</span>
        <div className="spacer" />
        <span className="muted small">{picked.length ? `${picked.length} sélectionnée${picked.length > 1 ? 's' : ''} (max 4)` : 'Coche 2 à 4 variantes pour les comparer'}</span>
        <button className="primary" disabled={picked.length < 2} data-testid="compare" onClick={() => navigate(`/compare/${picked.join(',')}`)}>
          <Icon name="compare" size={15} /> Comparer côte à côte
        </button>
      </header>
      <ul className="card-grid variants">
        {variants.map((v) => {
          const parent = v.parentId ? byId.get(v.parentId) : undefined
          const s = surfaces(v.state)
          const on = picked.includes(v.id)
          return (
            <li key={v.id} className={`card variant-card${on ? ' picked' : ''}`} data-testid="variant-card">
              <Thumb doc={v.state} onOpen={() => navigate(`/v/${v.id}`)} label={`Ouvrir ${v.name}`}>
                <label className={`pick-badge${on ? ' on' : ''}`} onClick={(e) => e.stopPropagation()} title="Sélectionner pour comparer">
                  <input type="checkbox" checked={on} onChange={() => toggle(v.id)} data-testid="pick-variant" />
                </label>
              </Thumb>
              <div className="card-body">
                <TextField className="variant-name" value={v.name} testId="variant-name" onCommit={async (name) => {
                  try { await repo.renameVariant(v.id, name) } catch (e) { alert(storageError(e)); return }
                  refresh()
                }} />
                <span className="card-meta">
                  {v.parentId ? `Issue de ${parent?.name ?? 'une variante supprimée'} (état #${v.parentSeq})` : 'Dessin d’origine'}
                </span>
                <span className="card-meta">
                  {v.maxSeq} modif. · {new Date(v.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span className="swatches">
                  {s.colors.map((c) => (
                    <span key={c.colorId} className="mini-swatch" style={{ background: c.hex }} title={`${c.name} · ${(c.area / 10000).toFixed(2)} m²`} />
                  ))}
                  {!s.colors.length && <span className="card-meta">Pas encore de peinture</span>}
                </span>
              </div>
              <div className="card-actions">
                <button className="primary small" onClick={() => navigate(`/v/${v.id}`)}>Ouvrir</button>
                <button className="small" data-testid="snapshot-from-card" onClick={async () => {
                  await repo.snapshotVariant(v.id).catch((e) => { alert(storageError(e)); return null })
                  refresh()
                }}><Icon name="copy" size={14} /> Dupliquer</button>
                <div className="spacer" />
                <button className="icon-btn ghost small danger" disabled={variants.length <= 1} title="Supprimer la variante" aria-label={`Supprimer ${v.name}`} onClick={async () => {
                  if (!confirm(`Supprimer « ${v.name} » et son historique ?`)) return
                  try { await repo.deleteVariant(v.id) } catch (e) { alert(storageError(e)); return }
                  setPicked((p) => p.filter((x) => x !== v.id))
                  refresh()
                }}><Icon name="trash" size={15} /></button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
