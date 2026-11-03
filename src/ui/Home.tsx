import { useEffect, useState } from 'react'
import * as repo from '../store/repo'
import type { Project, Variant } from '../model/types'
import { navigate } from './router'
import { DEFAULT_WALL } from '../model/defaults'

type Row = Project & { variants: Variant[] }

export function Home() {
  const [projects, setProjects] = useState<Row[] | null>(null)
  const [name, setName] = useState('')
  const [w, setW] = useState(DEFAULT_WALL.w)
  const [h, setH] = useState(DEFAULT_WALL.h)

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
        <h2>Projets</h2>
        {projects === null ? null : projects.length === 0 ? (
          <p className="empty">Aucun projet pour l'instant.</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id} className="project-card" data-testid="project-card">
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
                    <button className="primary" onClick={() => navigate(`/v/${p.variants[p.variants.length - 1].id}`)}>
                      Ouvrir
                    </button>
                  )}
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
