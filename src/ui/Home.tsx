import { useEffect, useState } from 'react'
import * as repo from '../store/repo'
import type { Project, Variant } from '../model/types'
import { navigate } from './router'
import { DEFAULT_WALL } from '../model/defaults'
import { DocPreview } from './DocPreview'
import { importProject } from '../export/project'

type Row = Project & { variants: Variant[] }

export function Home() {
  const [projects, setProjects] = useState<Row[] | null>(null)
  const [name, setName] = useState('')
  const [w, setW] = useState(DEFAULT_WALL.w)
  const [h, setH] = useState(DEFAULT_WALL.h)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const refresh = () => repo.listProjects().then(setProjects)
  useEffect(() => {
    refresh()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const { variant } = await repo.createProject(name.trim() || 'Nouveau mur', { w: Math.max(10, w), h: Math.max(10, h) })
    navigate(`/v/${variant.id}`)
  }

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden>▦</span>
          <div>
            <h1>BetterDraw</h1>
            <p>Dessiner à l'échelle, peindre au mur.</p>
          </div>
        </div>
      </header>

      <form className="new-project" onSubmit={create} data-testid="new-project-form">
        <h2>Nouveau projet</h2>
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chambre de Léa" name="name" />
        </label>
        <div className="row">
          <label>
            Largeur du mur (cm)
            <input type="number" min={10} value={w} onChange={(e) => setW(+e.target.value)} name="width" />
          </label>
          <label>
            Hauteur du mur (cm)
            <input type="number" min={10} value={h} onChange={(e) => setH(+e.target.value)} name="height" />
          </label>
        </div>
        <button type="submit" className="primary">Créer le projet</button>
      </form>

      <section className="projects">
        <div className="projects-head">
          <h2>Projets</h2>
          <label className="import-btn">
            <input type="file" accept=".json,application/json" hidden data-testid="import-project"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  const { project } = await importProject(JSON.parse(await f.text()))
                  setImportMsg(`« ${project.name} » importé`)
                  refresh()
                } catch (err) {
                  setImportMsg(`Import impossible : ${(err as Error).message}`)
                }
              }} />
            Importer une sauvegarde (.json)
          </label>
        </div>
        {importMsg && <p className="hint" data-testid="import-msg">{importMsg}</p>}
        {projects === null ? null : projects.length === 0 ? (
          <p className="empty">Aucun projet pour l'instant.</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id} className="project-card" data-testid="project-card">
                {p.variants[0] && (
                  <button className="thumb small-thumb" onClick={() => navigate(`/p/${p.id}`)}>
                    <DocPreview doc={[...p.variants].sort((a, b) => b.updatedAt - a.updatedAt)[0].state} showGrid={false} className="thumb-svg" />
                  </button>
                )}
                <div className="project-main">
                  <strong>{p.name}</strong>
                  <span className="muted">
                    {p.variants[0] ? `${p.variants[0].state.wall.w} × ${p.variants[0].state.wall.h} cm · ` : ''}
                    {p.variants.length} variante{p.variants.length > 1 ? 's' : ''} · modifié le{' '}
                    {new Date(p.updatedAt).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <div className="project-actions">
                  {p.variants[0] && (
                    <button className="primary" onClick={() => navigate(`/v/${[...p.variants].sort((a, b) => b.updatedAt - a.updatedAt)[0].id}`)}>
                      Ouvrir
                    </button>
                  )}
                  <button onClick={() => navigate(`/p/${p.id}`)} data-testid="open-variants">Variantes</button>
                  <button
                    className="ghost danger"
                    onClick={async () => {
                      if (confirm(`Supprimer le projet « ${p.name} » ?`)) {
                        await repo.deleteProject(p.id)
                        refresh()
                      }
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
