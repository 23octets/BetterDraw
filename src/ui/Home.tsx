import { AccountButton } from '../account/AccountGate'
import { liveQuery } from 'dexie'
import { Guide } from './Guide'
import { exampleDoc } from '../model/example'
import { StorageNotice } from './StorageNotice'
import { storageError } from '../store/storage'
import { serializeProject } from '../export/project'
import { useEffect, useState } from 'react'
import * as repo from '../store/repo'
import type { Project, ProjectKind, Variant, Wall } from '../model/types'
import { navigate } from './router'
import { DEFAULT_WALL } from '../model/defaults'
import { Thumb } from './DocPreview'
import { importProject, InvalidHistoryError, ImportError } from '../export/project'
import { Icon } from './icons'
import { createRoomProject, addRoom, addStandaloneWall, type RoomShape } from '../store/rooms'
import { RoomThumb } from '../room/RoomThumb'
import { DEFAULT_ROOM, roomArea } from '../room/geometry'

type Row = Project & { variants: Variant[]; walls: Wall[]; kind: ProjectKind }

const KIND_LABEL: Record<ProjectKind, string> = { wall: 'Mur 2D', room: 'Pièce 3D', both: 'Pièce 3D + mur 2D' }

const latest = (vs: Variant[]) => [...vs].sort((a, b) => b.updatedAt - a.updatedAt)[0]
const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

export function Home() {
  const [importing, setImporting] = useState(false)
  const [projects, setProjects] = useState<Row[] | null>(null)
  const [name, setName] = useState('')
  const [exampleBusy, setExampleBusy] = useState(false)
  const [w, setW] = useState(DEFAULT_WALL.w)
  const [h, setH] = useState(DEFAULT_WALL.h)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [kind, setKind] = useState<ProjectKind>('wall')
  const [rw, setRw] = useState(DEFAULT_ROOM.w)
  const [rd, setRd] = useState(DEFAULT_ROOM.d)
  const [rh, setRh] = useState(DEFAULT_ROOM.h)
  const [shape, setShape] = useState<RoomShape>('rect')

  const [error, setError] = useState('')
  const refresh = () => repo.listProjects().then((rows) => { setProjects(rows); setError('') }).catch((e) => setError(storageError(e)))
  const backup = async (p: Project) => {
    try {
      const data = await serializeProject(p.id)
      if (data.warnings?.length && !window.confirm(data.warnings.join('\n') + '\nTélécharger quand même cette sauvegarde incomplète ?')) {
        setImportMsg('Sauvegarde annulée.')
        return
      }
      const { download, safeName } = await import('../export/pdf')
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeName(p.name)}.frsque.json`)
      setImportMsg(data.warnings?.length ? 'Sauvegarde incomplète téléchargée. Conservez vos autres sauvegardes : ' + data.warnings.join(' ') : 'Sauvegarde téléchargée. Conservez ce fichier hors du navigateur.')
    } catch (e) { setError(storageError(e)) }
  }
  useEffect(() => {
    const subscription = liveQuery(() => repo.listProjects()).subscribe({
      next: (rows) => { setProjects(rows); setError('') },
      error: (e) => setError(storageError(e)),
    })
    return () => subscription.unsubscribe()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (kind !== 'wall') {
      const wall2d = kind === 'both' ? { w: Math.max(10, w), h: Math.max(10, h) } : undefined
      const p = await createRoomProject(name.trim() || 'Nouvelle pièce', { w: Math.max(50, rw), d: Math.max(50, rd), h: Math.max(100, rh) }, shape, wall2d)
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
            <h1>frsque</h1>
            <p>Dessiner à l'échelle, peindre au mur.</p>
          </div>
        </div>
        <AccountButton />
      </header>
      <div className="welcome-actions">
        <button disabled={exampleBusy} onClick={async () => {
          setExampleBusy(true)
          try {
            const { variant } = await repo.createProject('Exemple — Paysage géométrique', undefined, exampleDoc())
            navigate(`/v/${variant.id}`)
          } catch (e) {
            setError(storageError(e))
            setExampleBusy(false)
          }
        }}>Créer un projet exemple</button>
        <Guide />
      </div>

      <StorageNotice revision={projects?.map((p) => p.id).join()} />
      {error && <div role="alert"><p>{error}</p><button onClick={refresh}>Réessayer</button></div>}
      <form className="new-project" onSubmit={(e) => { void create(e).catch((err) => setError(storageError(err))) }} data-testid="new-project-form">
        <div className="new-project-top">
          <h2>Nouveau projet</h2>
          <div className="seg" role="group" aria-label="Type de projet">
            <button type="button" className={kind === 'wall' ? 'on' : ''} aria-pressed={kind === 'wall'} onClick={() => setKind('wall')} data-testid="kind-wall" title="Un mur seul, dessiné en 2D">Mur 2D</button>
            <button type="button" className={kind === 'room' ? 'on' : ''} aria-pressed={kind === 'room'} onClick={() => setKind('room')} data-testid="kind-room" title="Une pièce : plan, murs et vue 3D">Pièce 3D</button>
            <button type="button" className={kind === 'both' ? 'on' : ''} aria-pressed={kind === 'both'} onClick={() => setKind('both')} data-testid="kind-both" title="Une pièce en 3D et un mur 2D indépendant">Pièce 3D + mur 2D</button>
          </div>
        </div>
        <div className="new-project-fields">
          <label className="field grow">
            <span>Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chambre de Léa" name="name" />
          </label>
          {kind !== 'wall' && (
            <>
              <div className="field shape-field">
                <span>Forme</span>
                <div className="seg shape-seg" role="group" aria-label="Forme de la pièce">
                  <button type="button" className={shape === 'rect' ? 'on' : ''} aria-pressed={shape === 'rect'} onClick={() => setShape('rect')} data-testid="shape-rect" title="Pièce rectangulaire">
                    <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden><rect x="2" y="2" width="16" height="12" /></svg> Rectangle
                  </button>
                  <button type="button" className={shape === 'L' ? 'on' : ''} aria-pressed={shape === 'L'} onClick={() => setShape('L')} data-testid="shape-L" title="Pièce en L (modifiable ensuite sur le plan)">
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
          )}
          {kind !== 'room' && (
            <>
              <label className="field">
                <span>{kind === 'both' ? 'Mur 2D : largeur' : 'Largeur (cm)'}</span>
                <input type="number" min={10} value={w} onChange={(e) => setW(+e.target.value)} name="width" />
              </label>
              <span className="times" aria-hidden>×</span>
              <label className="field">
                <span>{kind === 'both' ? 'Mur 2D : hauteur' : 'Hauteur (cm)'}</span>
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
            <input type="file" accept=".json,application/json" hidden disabled={importing} data-testid="import-project"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f || importing) return
                setImporting(true)
                setImportMsg('Vérification de la sauvegarde…')
                try {
                  const content = await f.text()
                  let data: unknown
                  try { data = JSON.parse(content) }
                  catch { throw new ImportError('Fichier illisible : ce n’est pas une sauvegarde JSON valide') }
                  const { project } = await importProject(data).catch((err: unknown) => {
                    if (err instanceof InvalidHistoryError && window.confirm(err.message + '\nImporter sans historique ?')) {
                      return importProject(data, { withoutHistory: true })
                    }
                    throw err
                  })
                  setImportMsg(`« ${project.name} » importé`)
                  refresh()
                } catch (err) {
                  setImportMsg(err instanceof ImportError || err instanceof InvalidHistoryError ? err.message : storageError(err))
                } finally {
                  setImporting(false)
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
            {projects.map((p) => (
              <ProjectCard key={p.id} p={p} onBackup={() => backup(p)} onChanged={refresh} onError={(e) => setError(storageError(e))} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ProjectCard({ p, onBackup, onChanged, onError }: { p: Row; onBackup: () => void; onChanged: () => void; onError: (e: unknown) => void }) {
  const flat = new Set(p.walls.filter((w) => w.standalone).map((w) => w.id))
  const flatVariants = p.variants.filter((v) => flat.has(v.wallId))
  const last2d = flatVariants.length ? latest(flatVariants) : null
  const open3d = () => navigate(`/r/${p.id}`)
  const open2d = () => last2d && navigate(`/v/${last2d.id}`)
  const room = p.kind !== 'wall' ? p.room : undefined
  return (
    <li className="card" data-testid="project-card" data-kind={p.kind}>
      {room ? (
        <RoomThumb room={room} variants={p.variants} onOpen={open3d} label={`Ouvrir ${p.name} en 3D`} />
      ) : last2d ? (
        <Thumb doc={last2d.state} onOpen={open2d} label={`Ouvrir ${p.name}`} />
      ) : null}
      <div className="card-body">
        <strong className="card-title" title={p.name}>{p.name}</strong>
        <span className="card-meta" data-testid="project-kind">
          <span className={`kind-badge ${p.kind}`}>{KIND_LABEL[p.kind]}</span>
          {room && <> · {room.walls.length} murs · {(roomArea(room) / 10000).toFixed(1).replace('.', ',')} m²</>}
          {!room && last2d && <> · {last2d.state.wall.w} × {last2d.state.wall.h} cm</>}
        </span>
        {room && last2d && <span className="card-meta">Mur 2D · {last2d.state.wall.w} × {last2d.state.wall.h} cm</span>}
        <span className="card-meta">
          <Icon name="layers" size={13} /> {p.variants.length} variante{p.variants.length > 1 ? 's' : ''} · {fmtDate(p.updatedAt)}
        </span>
      </div>
      <div className="card-actions">
        {room && <button className="primary small" onClick={open3d} data-testid="open-room" aria-label={last2d ? `Ouvrir ${p.name} en 3D` : undefined}><Icon name="cube" size={14} /> {last2d ? '3D' : 'Ouvrir la pièce'}</button>}
        {last2d && <button className={`${room ? '' : 'primary '}small`} onClick={open2d} data-testid="open-wall" aria-label={room ? `Ouvrir le mur 2D de ${p.name}` : undefined}>{room ? '2D' : 'Ouvrir'}</button>}
        {last2d && (
          <button className="small" onClick={() => navigate(`/p/${p.id}`)} data-testid="open-variants">
            <Icon name="layers" size={14} /> Variantes
          </button>
        )}
        <button className="small" aria-label={`Sauvegarder ${p.name} (.json)`} onClick={onBackup}>Sauvegarder (.json)</button>
        <div className="spacer" />
        {p.kind === 'wall' && (
          <button className="icon-btn small" title="Ajouter une pièce 3D : le mur 2D est conservé, et le premier mur de la pièce reçoit une copie de son dessin" aria-label={`Ajouter une pièce 3D à ${p.name}`} data-testid="convert-room" onClick={async () => {
            try { await addRoom(p.id) } catch (e) { onError(e); return }
            navigate(`/r/${p.id}`)
          }}><Icon name="cube" size={14} /></button>
        )}
        {p.kind === 'room' && (
          <button className="icon-btn small" title="Ajouter un mur 2D indépendant de la pièce" aria-label={`Ajouter un mur 2D à ${p.name}`} data-testid="add-wall-2d" onClick={async () => {
            try { await addStandaloneWall(p.id) } catch (e) { onError(e); return }
            onChanged()
          }}><Icon name="plus" size={14} /></button>
        )}
        <DeleteProject p={p} onDone={onChanged} />
      </div>
    </li>
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
