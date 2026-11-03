import { useEffect, useState } from 'react'
import * as repo from '../store/repo'
import type { Project, Variant } from '../model/types'
import { navigate } from './router'
import { DocPreview } from './DocPreview'
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
        <button className="ghost" onClick={() => navigate('/')}>← Projets</button>
        <TextField className="project-title" value={project.name} testId="project-title" onCommit={async (name) => {
          await repo.renameProject(project.id, name)
          refresh()
        }} />
        <div className="spacer" />
        <span className="muted">{picked.length ? `${picked.length} sélectionnée(s)` : 'Coche 2 à 4 variantes pour les comparer'}</span>
        <button className="primary" disabled={picked.length < 2} data-testid="compare" onClick={() => navigate(`/compare/${picked.join(',')}`)}>
          Comparer côte à côte
        </button>
      </header>
      <ul className="variant-grid">
        {variants.map((v) => {
          const parent = v.parentId ? byId.get(v.parentId) : undefined
          const s = surfaces(v.state)
          return (
            <li key={v.id} className={`variant-card${picked.includes(v.id) ? ' picked' : ''}`} data-testid="variant-card">
              <button className="thumb" onClick={() => navigate(`/v/${v.id}`)} title="Ouvrir">
                <DocPreview doc={v.state} showGrid={false} className="thumb-svg" />
              </button>
              <div className="variant-meta">
                <label className="check pick">
                  <input type="checkbox" checked={picked.includes(v.id)} onChange={() => toggle(v.id)} data-testid="pick-variant" />
                </label>
                <TextField className="variant-name" value={v.name} testId="variant-name" onCommit={async (name) => {
                  await repo.renameVariant(v.id, name)
                  refresh()
                }} />
              </div>
              <p className="muted small">
                {v.parentId ? `Issue de ${parent?.name ?? 'une variante supprimée'} (état #${v.parentSeq})` : 'Dessin d’origine'} ·{' '}
                {v.maxSeq} modif. · {new Date(v.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              <p className="swatches">
                {s.colors.map((c) => (
                  <span key={c.colorId} className="mini-swatch" style={{ background: c.hex }} title={`${c.name} · ${(c.area / 10000).toFixed(2)} m²`} />
                ))}
              </p>
              <div className="variant-actions">
                <button className="primary small" onClick={() => navigate(`/v/${v.id}`)}>Ouvrir</button>
                <button className="small" data-testid="snapshot-from-card" onClick={async () => {
                  await repo.snapshotVariant(v.id)
                  refresh()
                }}>Dupliquer</button>
                <button className="small ghost danger" disabled={variants.length <= 1} onClick={async () => {
                  if (!confirm(`Supprimer « ${v.name} » et son historique ?`)) return
                  await repo.deleteVariant(v.id)
                  setPicked((p) => p.filter((x) => x !== v.id))
                  refresh()
                }}>Supprimer</button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
