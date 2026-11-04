import { StorageNotice } from './StorageNotice'
import { storageError } from '../store/storage'
import { serializeProject } from '../export/project'
import { useEffect, useState } from 'react'
import * as repo from '../store/repo'
import type { Project, Variant } from '../model/types'
import { navigate } from './router'
import { DEFAULT_WALL } from '../model/defaults'
import { Thumb } from './DocPreview'
import { importProject, ImportError } from '../export/project'
import { Icon } from './icons'
import { createRoomProject, convertToRoom, type RoomShape } from '../store/rooms'
import { RoomThumb } from '../room/RoomThumb'
import { DEFAULT_ROOM, roomArea } from '../room/geometry'

type Row = Project & { variants: Variant[] }

const latest = (vs: Variant[]) => [...vs].sort((a, b) => b.updatedAt - a.updatedAt)[0]
const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

export function Home() {
  const [projects, setProjects] = useState<Row[] | null>(null)
  const [name, setName] = useState('')
  const [w, setW] = useState(DEFAULT_WALL.w)
  const [h, setH] = useState(DEFAULT_WALL.h)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [kind, setKind] = useState<'wall' | 'room'>('wall')
  const [rw, setRw] = useState(DEFAULT_ROOM.w)
  const [rd, setRd] = useState(DEFAULT_ROOM.d)
  const [rh, setRh] = useState(DEFAULT_ROOM.h)
  const [shape, setShape] = useState<RoomShape>('rect')

  const [error, setError] = useState('')
  const refresh = () => repo.listProjects().then((rows) => { setProjects(rows); setError('') }).catch((e) => setError(storageError(e)))
  const backup = async (p: Project) => {
    try {
      const data = await serializeProject(p.id)
      const { download, safeName } = await import('../export/pdf')
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeName(p.name)}.betterdraw.json`)
      setImportMsg('Sauvegarde téléchargée. Conservez ce fichier hors du navigateur.')
    } catch (e) { setError(storageError(e)) }
  }
  useEffect(() => {
    refresh()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (kind === 'room') {
      const p = await createRoomProject(name.trim() || 'Nouvelle pièce', { w: Math.max(50, rw), d: Math.max(50, rd), h: Math.max(100, rh) }, shape)
      navigate(`/r/${p.id}`)
      return
    }
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

      <StorageNotice revision={projects?.map((p) => p.id).join()} />
      {error && <div role="alert"><p>{error}</p><button onClick={refresh}>Réessayer</button></div>}
      <form className="new-project" onSubmit={(e) => { void create(e).catch((err) => setError(storageError(err))) }} data-testid="new-project-form">
        <div className="new-project-top">
          <h2>Nouveau projet</h2>
          <div className="seg" role="group" aria-label="Type de projet">
            <button type="button" className={kind === 'wall' ? 'on' : ''} onClick={() => setKind('wall')} data-testid="kind-wall">Un mur</button>
            <button type="button" className={kind === 'room' ? 'on' : ''} onClick={() => setKind('room')} data-testid="kind-room">Une pièce (3D)</button>
          </div>
        </div>
        <div className="new-project-fields">
          <label className="field grow">
            <span>Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chambre de Léa" name="name" />
          </label>
          {kind === 'room' ? (
            <>
              <div className="field">
                <span>Forme</span>
                <div className="seg shape-seg" role="group" aria-label="Forme de la pièce">
                  <button type="button" className={shape === 'rect' ? 'on' : ''} onClick={() => setShape('rect')} data-testid="shape-rect" title="Pièce rectangulaire">
                    <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden><rect x="2" y="2" width="16" height="12" /></svg> Rectangle
                  </button>
                  <button type="button" className={shape === 'L' ? 'on' : ''} onClick={() => setShape('L')} data-testid="shape-L" title="Pièce en L (modifiable ensuite sur le plan)">
                    <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden><path d="M2 2H18V8H10V14H2Z" /></svg> En L
                  </button>
                </div>
              </div>
              <label className="field">
                <span>{shape === 'L' ? 'Largeur totale' : 'Largeur (cm)'}</span>
                <input type="number" min={50} value={rw} onChange={(e) => setRw(+e.target.value)} name="room-w" />
              </label>
              <span className="times" aria-hidden>×</span>
              <label className="field">
                <span>{shape === 'L' ? 'Profondeur totale' : 'Profondeur (cm)'}</span>
                <input type="number" min={50} value={rd} onChange={(e) => setRd(+e.target.value)} name="room-d" />
              </label>
              <label className="field">
                <span>Hauteur s/ plafond</span>
                <input type="number" min={100} value={rh} onChange={(e) => setRh(+e.target.value)} name="room-h" />
              </label>
            </>
          ) : (
          <>
          <label className="field">
            <span>Largeur (cm)</span>
            <input type="number" min={10} value={w} onChange={(e) => setW(+e.target.value)} name="width" />
          </label>
          <span className="times" aria-hidden>×</span>
          <label className="field">
            <span>Hauteur (cm)</span>
            <input type="number" min={10} value={h} onChange={(e) => setH(+e.target.value)} name="height" />
          </label>
          </>
          )}
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
                  const content = await f.text()
                  let parsed: unknown
                  try { parsed = JSON.parse(content) }
                  catch { throw new ImportError('Fichier illisible : ce n’est pas une sauvegarde JSON valide') }
                  const { project } = await importProject(parsed)
                  setImportMsg(`« ${project.name} » importé`)
                  refresh()
                } catch (err) {
                  setImportMsg(err instanceof ImportError ? err.message : storageError(err))
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
              if (p.room) {
                const open = () => navigate(`/r/${p.id}`)
                return (
                  <li key={p.id} className="card" data-testid="project-card">
                    <RoomThumb room={p.room} variants={p.variants} onOpen={open} label={`Ouvrir ${p.name}`} />
                    <div className="card-body">
                      <strong className="card-title" title={p.name}>{p.name}</strong>
                      <span className="card-meta">Pièce · {p.room.walls.length} murs · {(roomArea(p.room) / 10000).toFixed(1).replace('.', ',')} m²</span>
                      <span className="card-meta">
                        <Icon name="layers" size={13} /> {p.variants.length} variante{p.variants.length > 1 ? 's' : ''} · {fmtDate(p.updatedAt)}
                      </span>
                    </div>
                    <div className="card-actions"><button className="small" aria-label={`Sauvegarder ${p.name} (.json)`} onClick={() => backup(p)}>Sauvegarder (.json)</button>
                      <button className="primary small" onClick={open} data-testid="open-room">Ouvrir la pièce</button>
                      <div className="spacer" />
                      <DeleteProject p={p} onDone={refresh} />
                    </div>
                  </li>
                )
              }
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
                  <div className="card-actions"><button className="small" aria-label={`Sauvegarder ${p.name} (.json)`} onClick={() => backup(p)}>Sauvegarder (.json)</button>
                    {last && <button className="primary small" onClick={() => navigate(`/v/${last.id}`)}>Ouvrir</button>}
                    <button className="small" onClick={() => navigate(`/p/${p.id}`)} data-testid="open-variants">
                      <Icon name="layers" size={14} /> Variantes
                    </button>
                    <button className="icon-btn small" title="Transformer en pièce : ce mur devient le premier des quatre murs d’une pièce visible en 3D" aria-label={`Transformer ${p.name} en pièce`} data-testid="convert-room" onClick={async () => {
                      try { await convertToRoom(p.id) } catch (e) { setError(storageError(e)); return }
                      navigate(`/r/${p.id}`)
                    }}><Icon name="cube" size={14} /></button>
                    <div className="spacer" />
                    <button
                      className="icon-btn ghost small danger"
                      title="Supprimer le projet"
                      aria-label={`Supprimer ${p.name}`}
                      onClick={async () => {
                        if (confirm(`Supprimer le projet « ${p.name} » et toutes ses variantes ?`)) {
                          try { await repo.deleteProject(p.id) } catch (e) { alert(storageError(e)); return }
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

function DeleteProject({ p, onDone }: { p: Project; onDone: () => void }) {
  return (
    <button
      className="icon-btn ghost small danger"
      title="Supprimer le projet"
      aria-label={`Supprimer ${p.name}`}
      onClick={async () => {
        if (confirm(`Supprimer le projet « ${p.name} » et toutes ses variantes ?`)) {
          try { await repo.deleteProject(p.id) } catch (e) { alert(storageError(e)); return }
          onDone()
        }
      }}
    >
      <Icon name="trash" size={15} />
    </button>
  )
}
