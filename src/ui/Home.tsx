import { useEffect, useState } from 'react'
import * as repo from '../store/repo'
import type { Project, Variant } from '../model/types'
import { navigate } from './router'
import { DEFAULT_WALL } from '../model/defaults'
import { Thumb } from './DocPreview'
import { importProject } from '../export/project'
import { Icon } from './icons'

type Row = Project & { variants: Variant[] }

const latest = (vs: Variant[]) => [...vs].sort((a, b) => b.updatedAt - a.updatedAt)[0]
const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

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
        <div className="new-project-fields">
          <label className="field grow">
            <span>Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chambre de Léa" name="name" />
          </label>
          <label className="field">
            <span>Largeur (cm)</span>
            <input type="number" min={10} value={w} onChange={(e) => setW(+e.target.value)} name="width" />
          </label>
          <span className="times" aria-hidden>×</span>
          <label className="field">
            <span>Hauteur (cm)</span>
            <input type="number" min={10} value={h} onChange={(e) => setH(+e.target.value)} name="height" />
          </label>
          <button type="submit" className="primary"><Icon name="plus" size={15} /> Créer le projet</button>
        </div>
      </form>

      <section className="projects">
        <div className="projects-head">
          <h2>Projets{projects?.length ? <span className="count">{projects.length}</span> : null}</h2>
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
            <Icon name="export" size={15} /> Importer une sauvegarde
          </label>
        </div>
        {importMsg && <p className="hint" data-testid="import-msg">{importMsg}</p>}
        {projects === null ? null : projects.length === 0 ? (
          <p className="empty">Aucun projet pour l'instant. Crée ton premier mur ci-dessus.</p>
        ) : (
          <ul className="card-grid">
            {projects.map((p) => {
              const last = p.variants.length ? latest(p.variants) : null
              return (
                <li key={p.id} className="card" data-testid="project-card">
                  {last && <Thumb doc={last.state} onOpen={() => navigate(`/v/${last.id}`)} label={`Ouvrir ${p.name}`} />}
                  <div className="card-body">
                    <strong className="card-title" title={p.name}>{p.name}</strong>
                    <span className="card-meta">
                      {last ? `${last.state.wall.w} × ${last.state.wall.h} cm` : ''}
                    </span>
                    <span className="card-meta">
                      <Icon name="layers" size={13} /> {p.variants.length} variante{p.variants.length > 1 ? 's' : ''} · {fmtDate(p.updatedAt)}
                    </span>
                  </div>
                  <div className="card-actions">
                    {last && <button className="primary small" onClick={() => navigate(`/v/${last.id}`)}>Ouvrir</button>}
                    <button className="small" onClick={() => navigate(`/p/${p.id}`)} data-testid="open-variants">
                      <Icon name="layers" size={14} /> Variantes
                    </button>
                    <div className="spacer" />
                    <button
                      className="icon-btn ghost small danger"
                      title="Supprimer le projet"
                      aria-label={`Supprimer ${p.name}`}
                      onClick={async () => {
                        if (confirm(`Supprimer le projet « ${p.name} » et toutes ses variantes ?`)) {
                          await repo.deleteProject(p.id)
                          refresh()
                        }
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
