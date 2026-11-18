import './home.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as repo from '../store/repo'
import type { DocState, Project, ProjectKind, Variant } from '../model/types'
import { DEFAULT_WALL } from '../model/defaults'
import { exampleDoc } from '../model/example'
import { importProject, ImportError, InvalidHistoryError, serializeProject, type ProjectFile } from '../export/project'
import { storageError } from '../store/storage'
import { BACKUP_LABEL, backupState, backupTimes, forgetBackup, markBackedUp, type BackupState } from '../store/backups'
import { resolveFills, surfaces, type ColorSurface } from '../store/fills'
import { addRoom, addStandaloneWall } from '../store/rooms'
import { roomArea } from '../room/geometry'
import { RoomThumb } from '../room/RoomThumb'
import { DocPreview, Thumb } from './DocPreview'
import { legal } from '../config/legal'
import { LegalInfo } from './LegalInfo'
import { AccountButton } from '../account/AccountGate'
import { liveQuery } from 'dexie'
import { Icon } from './icons'
import { navigate } from './router'

type Row = Awaited<ReturnType<typeof repo.listProjects>>[number]
const KIND_LABEL: Record<ProjectKind, string> = { wall: 'Mur 2D', room: 'Pièce 3D', both: 'Pièce 3D + mur 2D' }
const flatVariant = (p: Row) => latest(p.variants.filter((v) => p.walls.some((w) => w.id === v.wallId && w.standalone)))
type Sort = 'date' | 'name' | 'width'

/** Au-delà de ce nombre de projets, la recherche et le tri apparaissent. */
const TOOLS_FROM = 9
/** Le nuancier liste au plus ce nombre de teintes ; les suivantes sont résumées sur une ligne. */
const CHIPS_MAX = 5

const latest = (vs: Variant[]) => [...vs].sort((a, b) => b.updatedAt - a.updatedAt)[0] as Variant | undefined
const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const fr = (n: number, digits = 1) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits })
const m2 = (cm2: number) => fr(cm2 / 10000)
const litres = (l: number) => l.toLocaleString('fr-FR', l < 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

interface Paint {
  colors: ColorSurface[]
  background: number
  area: number
  liters: number
}

const paints = new WeakMap<DocState, Paint | null>()
/** Surfaces et litres d'un dessin ; null si le calcul échoue (la carte s'affiche alors sans quantités). */
function paintOf(doc: DocState): Paint | null {
  if (!paints.has(doc)) {
    try {
      const s = surfaces(doc)
      const colors = [...s.colors].sort((a, b) => b.area - a.area)
      paints.set(doc, { colors, background: s.background.area, area: colors.reduce((t, c) => t + c.area, 0), liters: colors.reduce((t, c) => t + c.liters, 0) })
    } catch { paints.set(doc, null) }
  }
  return paints.get(doc) ?? null
}

/** Un point à l'intérieur de la plus grande zone de chaque couleur, pour y ancrer son trait de liaison. */
function zoneMarks(doc: DocState, colors: ColorSurface[]) {
  try {
    const fills = resolveFills(doc)
    return colors.map((c) => {
      const zone = fills.filter((f) => f.fill.colorId === c.colorId).sort((a, b) => b.region.area - a.region.area)[0]
      const p = zone?.region.item.interiorPoint ?? zone?.fill.seed
      return p ? { x: p.x, y: p.y } : null
    })
  } catch { return colors.map(() => null) }
}

function download(data: unknown, filename: string) {
  return import('../export/pdf').then(({ download: save }) => save(new Blob([JSON.stringify(data)], { type: 'application/json' }), filename))
}

export function Home() {
  const [projects, setProjects] = useState<Row[] | null>(null)
  const [times, setTimes] = useState(backupTimes)
  const [error, setError] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('date')
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = () => repo.listProjects().then((rows) => { setProjects(rows); setTimes(backupTimes()); setError('') }).catch((e) => setError(storageError(e)))
  useEffect(() => {
    const sub = liveQuery(() => repo.listProjects()).subscribe({
      next: (rows) => { setProjects(rows); setTimes(backupTimes()); setError('') },
      error: (e) => setError(storageError(e)),
    })
    return () => sub.unsubscribe()
  }, [])

  const openProject = (p: Row) => {
    const v = latest(p.variants)
    navigate(p.room ? `/r/${p.id}` : v ? `/v/${v.id}` : `/p/${p.id}`)
  }

  async function openExample() {
    setBusy(true)
    try {
      const { variant } = await repo.createProject('Exemple — Paysage géométrique', undefined, exampleDoc())
      navigate(`/v/${variant.id}`)
    } catch (e) { setError(storageError(e)); setBusy(false) }
  }

  /** Demande confirmation si des images manquent ; renvoie false si l'utilisateur renonce. */
  const accept = (files: ProjectFile[]) => {
    const warnings = files.flatMap((f) => f.warnings ?? [])
    return { warnings, ok: !warnings.length || window.confirm(warnings.join('\n') + '\nTélécharger quand même cette sauvegarde incomplète ?') }
  }

  async function backup(p: Project) {
    try {
      const startedAt = Date.now()
      const data = await serializeProject(p.id)
      const { warnings, ok } = accept([data])
      if (!ok) { setMessage('Sauvegarde annulée.'); return }
      const { safeName } = await import('../export/pdf')
      await download(data, `${safeName(p.name)}.frsque.json`)
      if (!warnings.length) markBackedUp([p.id], startedAt)
      setTimes(backupTimes())
      setMessage(warnings.length ? 'Sauvegarde incomplète téléchargée. Conservez vos autres sauvegardes : ' + warnings.join(' ') : 'Copie de secours téléchargée. Range ce fichier hors du navigateur.')
    } catch (e) { setError(storageError(e)) }
  }

  async function backupAll() {
    if (!projects?.length) return
    try {
      const startedAt = Date.now()
      const files: ProjectFile[] = []
      for (const p of projects) files.push(await serializeProject(p.id))
      const { warnings, ok } = accept(files)
      if (!ok) { setMessage('Sauvegarde annulée.'); return }
      await download({ format: 'frsque-backup', version: 1, exportedAt: startedAt, projects: files }, `frsque-${new Date().toISOString().slice(0, 10)}.frsque.json`)
      markBackedUp(files.filter((f) => !f.warnings?.length).map((f) => f.project.id), startedAt)
      setTimes(backupTimes())
      setMessage(warnings.length ? 'Sauvegarde incomplète téléchargée. Conservez vos autres sauvegardes : ' + warnings.join(' ') : `${plural(files.length, 'projet')} dans un seul fichier. Range-le hors du navigateur.`)
    } catch (e) { setError(storageError(e)) }
  }

  async function importFile(file: File) {
    setBusy(true)
    setMessage('Vérification de la sauvegarde…')
    try {
      let data: unknown
      try { data = JSON.parse(await file.text()) }
      catch { throw new ImportError('Fichier illisible : ce n’est pas une sauvegarde JSON valide') }
      const root = data && typeof data === 'object' ? data as { format?: unknown; projects?: unknown } : null
      // « Tout télécharger » produit un seul fichier qui regroupe les projets
      if (root?.format === 'frsque-backup' && (!Array.isArray(root.projects) || !root.projects.length || (root as { version?: unknown }).version !== 1)) throw new ImportError('Sauvegarde groupée invalide')
      const items = root?.format === 'frsque-backup' && Array.isArray(root.projects) ? root.projects : [data]
      const names: string[] = []
      for (const item of items) {
        let recovered = false
        const { project } = await importProject(item).catch((err: unknown) => {
          if (err instanceof InvalidHistoryError && window.confirm(err.message + '\nImporter sans historique ?')) { recovered = true; return importProject(item, { withoutHistory: true }) }
          throw err
        })
        // Seul un fichier complet, importé sans récupération, constitue une copie à jour.
        if (!recovered && !(item as ProjectFile).warnings?.length) markBackedUp([project.id])
        names.push(project.name)
      }
      setMessage(names.length === 1 ? `« ${names[0]} » importé` : `${plural(names.length, 'projet')} importés`)
    } catch (err) {
      setMessage(err instanceof ImportError || err instanceof InvalidHistoryError ? err.message : storageError(err))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  async function remove(p: Project) {
    if (!window.confirm(`Supprimer le projet « ${p.name} » et toutes ses variantes ?`)) return
    try { await repo.deleteProject(p.id) } catch (e) { setError(storageError(e)); return }
    forgetBackup(p.id)
    void refresh()
  }

  async function toRoom(p: Project) {
    try { await addRoom(p.id) } catch (e) { setError(storageError(e)); return }
    navigate(`/r/${p.id}`)
  }

  const first = projects?.[0]
  const others = useMemo(() => {
    const rest = (projects ?? []).slice(1)
    const q = query.trim().toLocaleLowerCase('fr')
    const found = q ? rest.filter((p) => p.name.toLocaleLowerCase('fr').includes(q)) : rest
    if (sort === 'name') return [...found].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    if (sort === 'width') return [...found].sort((a, b) => (latest(b.variants)?.state.wall.w ?? 0) - (latest(a.variants)?.state.wall.w ?? 0))
    return found
  }, [projects, query, sort])
  const toWall = async (p: Project) => {
    try { await addStandaloneWall(p.id) } catch (e) { setError(storageError(e)) }
  }
  const actions = { open: openProject, backup, remove, toRoom, toWall }

  return (
    <div className={`home ${first ? 'retour' : 'premier'}${projects?.length === 1 ? ' seul' : ''}`}>
      <header className="h-top h-wrap">
        <div className="h-brand"><img src="/favicon.svg" alt="" width={32} height={32} />
          <span className="h-wordmark" role="img" aria-label={legal.productName}>
            {Array.from(legal.productName).map((letter, i, letters) => (
              <span key={i} aria-hidden style={{ fontWeight: Math.round(700 - 600 * i / Math.max(1, letters.length - 1)) }}>{letter}</span>
            ))}
          </span>
        </div>
        <nav className="h-nav" aria-label="Raccourcis">
            <input ref={fileInput} type="file" accept=".json,application/json" hidden disabled={busy} data-testid="import-project"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f && !busy) void importFile(f)
              }} />
          <button type="button" className="h-btn quiet" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Icon name="up" size={16} /> Importer un projet
          </button>
        </nav>
      </header>

      {(error || message) && (
        <div className="h-wrap h-notes">
          {error && <div role="alert" className="h-alert"><p>{error}</p><button className="h-btn sm quiet" onClick={refresh}>Réessayer</button></div>}
          {message && <p className="h-msg" data-testid="import-msg">{message}</p>}
        </div>
      )}

      {projects !== null && (
        <main>
          <section className="h-hero h-wrap" data-testid={first ? 'project-card' : undefined} data-kind={first?.kind}>
            {first ? <Resume p={first} state={backupState(first, first.variants, times)} {...actions} /> : (
              <div className="h-intro">
                <h1>Imagine ton mur avant de le peindre.</h1>
                <p className="h-lede">Dessine ton décor au centimètre et essaie tes couleurs zone par zone. Le mode Consultation te permet d’exporter un PDF avec les cotes et la grille pour faciliter le report sur le vrai mur.</p>
                <div className="h-go"><button className="h-btn quiet" disabled={busy} onClick={openExample}>Ouvrir le projet exemple</button></div>
              </div>
            )}
            {first ? <Sample p={first} onOpen={() => openProject(first)} /> : <ExampleSample />}
          </section>

          <NewProject collapsible={!!first} onError={(e) => setError(storageError(e))} />

          {first && projects.length > 1 && (
            <section className="h-projects h-wrap" aria-labelledby="h-t-projects">
              <div className="h-section-head">
                <h2 id="h-t-projects">Tes autres projets</h2>
                <button className="h-btn sm quiet" onClick={backupAll}><Icon name="down" size={16} /> Tout télécharger</button>
              </div>
              {projects.length >= TOOLS_FROM && (
                <div className="h-tools">
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un projet" aria-label="Chercher un projet" />
                  <label>Trier par <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="date">Dernière modification</option>
                    <option value="name">Nom</option>
                    <option value="width">Largeur du mur</option>
                  </select></label>
                </div>
              )}
              {others.length > 0 && (
                <ul className="h-grid">
                  {others.map((p) => <Card key={p.id} p={p} state={backupState(p, p.variants, times)} {...actions} />)}
                </ul>
              )}
              {projects.length > 1 && others.length === 0 && <p className="h-none">Aucun projet ne porte ce nom.</p>}
            </section>
          )}

          <Privacy />
        </main>
      )}
      <footer className="h-footer h-wrap">
        <AccountButton />
        <LegalInfo />
      </footer>
    </div>
  )
}

interface CardActions {
  open: (p: Row) => void
  backup: (p: Project) => void
  remove: (p: Project) => void
  toRoom: (p: Project) => void
  toWall: (p: Project) => void
}

function describe(p: Row) {
  const v = latest(p.variants)
  if (p.room) return `${KIND_LABEL[p.kind]} · ${plural(p.room.walls.length, 'mur')}, ${fr(roomArea(p.room) / 10000)} m² au sol`
  return v ? `${v.state.wall.w} × ${v.state.wall.h} cm` : ''
}

/** Lien « 3 variantes » : il mène à la page des variantes d'un mur ; une pièce range les siennes par mur. */
function Variants({ p }: { p: Row }) {
  const label = plural(p.variants.length, 'variante')
  return !flatVariant(p) ? <>{label}</> : <a href={`#/p/${p.id}`} data-testid="open-variants" onClick={(e) => { e.preventDefault(); navigate(`/p/${p.id}`) }}>{label}</a>
}

/** Le dernier projet ouvert : son nom, son état, et le seul bouton plein de la page. */
function Resume({ p, state, open, backup, remove, toRoom, toWall }: { p: Row; state: BackupState } & CardActions) {
  return (
    <div className="h-resume">
      <p className="h-lead-in">Ton dernier projet</p>
      <h1 className={p.name.length > 30 ? 'long' : undefined} title={p.name}>{p.name}</h1>
      <p className="h-meta" data-testid="project-kind">{describe(p)}, <Variants p={p} />, modifié&nbsp;le&nbsp;{fmtDate(p.updatedAt)}</p>
      {p.kind === 'both' && <p>Mur 2D · {flatVariant(p)?.state.wall.w} × {flatVariant(p)?.state.wall.h} cm</p>}
      <p className={`h-copy ${state}`}>{BACKUP_LABEL[state]}</p>
      <div className="h-go card-actions">
        {p.kind === 'both' && <button className="h-btn quiet" data-testid="open-wall" onClick={() => navigate(`/v/${flatVariant(p)!.id}`)}>Ouvrir le mur 2D</button>}
        <button className="h-btn" onClick={() => open(p)} data-testid={p.room ? 'open-room' : undefined}>{p.room ? 'Ouvrir la pièce' : 'Reprendre le dessin'}</button>
        <button className="h-btn quiet" onClick={() => backup(p)} aria-label={`Télécharger une copie de secours de ${p.name}`}><Icon name="down" size={16} /> Télécharger une copie</button>
        <Menu p={p} remove={remove} toRoom={toRoom} toWall={toWall} />
      </div>
    </div>
  )
}

/** Relie les coordonnées du dessin aux pastilles après projection des deux murs. */
function ColorLinks({ marks }: { marks: ({ x: number; y: number } | null)[] }) {
  const ref = useRef<SVGSVGElement>(null)
  const [links, setLinks] = useState<{ d: string; x: number; y: number; tx: number; ty: number }[]>([])
  useLayoutEffect(() => {
    const overlay = ref.current
    const figure = overlay?.parentElement
    const mural = figure?.querySelector<SVGSVGElement>('.h-mural .thumb-svg')
    const chips = figure?.querySelectorAll<HTMLElement>('.h-chips .sw[data-color]')
    if (!overlay || !figure || !mural || !chips) return
    const measure = () => {
      const matrix = mural.getScreenCTM()
      const screen = overlay.getScreenCTM()
      if (!matrix || !screen) return
      const inverse = screen.inverse()
      const point = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(inverse)
      const wall = figure.querySelector<HTMLElement>('.h-mural')!
      const seam = wall.getBoundingClientRect().right
      const angle = parseFloat(getComputedStyle(figure).getPropertyValue('--wall-angle')) * Math.PI / 180
      setLinks(marks.flatMap((mark, i) => {
        const chip = chips[i]
        if (!mark || !chip) return []
        const from = new DOMPoint(mark.x, mark.y).matrixTransform(matrix).matrixTransform(inverse)
        const box = chip.getBoundingClientRect()
        const x = box.left + box.width / 2, y = box.top + box.height / 2
        const to = point(x, y)
        const fold = point(seam, y + Math.tan(angle) * (x - seam))
        return [{ d: `M${from.x},${from.y} L${fold.x},${fold.y} L${to.x},${to.y}`, x: from.x, y: from.y, tx: to.x, ty: to.y }]
      }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(figure)
    observer.observe(mural)
    // La police locale peut changer les hauteurs après le premier rendu.
    let active = true
    void document.fonts.ready.then(() => { if (active) measure() })
    return () => { active = false; observer.disconnect() }
  }, [marks])
  return <svg ref={ref} className="h-color-links" aria-hidden>
    {links.map((link, i) => <g key={i}>
      <path className="halo" d={link.d} />
      <path d={link.d} />
      <circle cx={link.x} cy={link.y} r={3} />
      <circle cx={link.tx} cy={link.ty} r={3} />
    </g>)}
  </svg>
}

/** Dessus du mur : un polygone fermé borde aussi les chants et le pli intérieur. */
function WallTop({ right = false }: { right?: boolean }) {
  const ref = useRef<SVGSVGElement>(null)
  const [shape, setShape] = useState('')
  useLayoutEffect(() => {
    const svg = ref.current!
    const wall = svg.parentElement!
    const measure = () => {
      const width = wall.clientWidth
      const depth = parseFloat(getComputedStyle(wall).getPropertyValue('--wall-depth'))
      setShape(right ? `0,0 ${width - depth},0 ${width},${depth} 0,${depth}` : `${depth},0 ${width},0 ${width},${depth} 0,${depth}`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wall)
    return () => observer.disconnect()
  }, [right])
  return <svg ref={ref} className={`h-wall-top${right ? ' right' : ''}`} aria-hidden><polygon points={shape} /></svg>
}

/** Une fresque reliée à son nuancier, avec surfaces et litres par couleur. */
function Nuancier({ doc, onOpen, label }: { doc: DocState; onOpen?: () => void; label?: string }) {
  const paint = paintOf(doc)
  const { shown, rest, marks } = useMemo(() => {
    const colors = paint?.colors ?? []
    // Suivre les zones de haut en bas limite les croisements entre les traits.
    const anchors = zoneMarks(doc, colors)
    const all = colors.map((color, i) => ({ color, anchor: anchors[i] }))
      .sort((a, b) => (a.anchor?.y ?? Infinity) - (b.anchor?.y ?? Infinity))
      .map(({ color }) => color)
    const shown = all.slice(0, all.length > CHIPS_MAX ? CHIPS_MAX - 1 : CHIPS_MAX)
    return { shown, rest: all.slice(shown.length), marks: zoneMarks(doc, shown) }
  }, [doc, paint])
  const { w, h } = doc.wall
  return (
    <figure className="h-sample">
      <div className={`thumb-frame h-mural${onOpen ? ' clickable' : ''}`} style={{ aspectRatio: String(Math.min(1.9, Math.max(0.9, w / h))) }}
        role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} aria-label={label} onClick={onOpen}
        onKeyDown={(e) => onOpen && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}>
        <WallTop />
        <DocPreview doc={doc} showGrid={false} showLines={false} className="thumb-svg" />

      </div>
      {paint && (
        <div className="h-qty" aria-label="Quantités par couleur">
          <WallTop right />
          <ol className="h-chips">
            {shown.map((c) => (
              <li key={c.colorId}>
                <span className="sw" data-color={c.colorId} style={{ background: c.hex }} />
                <span className="tx"><strong>{c.name}</strong><small>{m2(c.area)} m², {litres(c.liters)} L</small></span>
              </li>
            ))}
            {rest.length > 0 && (
              <li>
                <span className="sw more">+{rest.length}</span>
                <span className="tx"><strong>{plural(rest.length, 'autre')} {rest.length > 1 ? 'teintes' : 'teinte'}</strong><small>{m2(rest.reduce((t, c) => t + c.area, 0))} m², {litres(rest.reduce((t, c) => t + c.liters, 0))} L</small></span>
              </li>
            )}
            {paint.background > 1 && (
              <li>
                <span className="sw" style={{ background: doc.background.hex }} />
                <span className="tx"><strong>Fond du mur</strong><small>{m2(paint.background)} m², non peint</small></span>
              </li>
            )}
          </ol>
        </div>
      )}
      {paint && <ColorLinks marks={marks} />}
    </figure>
  )
}

function Sample({ p, onOpen }: { p: Row; onOpen: () => void }) {
  const v = latest(p.variants)
  if (p.room) return <figure className="h-sample room"><RoomThumb room={p.room} variants={p.variants} onOpen={onOpen} label={`Ouvrir ${p.name}`} /></figure>
  return v ? <Nuancier doc={v.state} onOpen={onOpen} label={`Ouvrir ${p.name}`} /> : null
}

function ExampleSample() {
  const doc = useMemo(() => exampleDoc(), [])
  return <Nuancier doc={doc} />
}

function Card({ p, state, open, backup, remove, toRoom, toWall }: { p: Row; state: BackupState } & CardActions) {
  const v = latest(p.variants)
  const paint = !p.room && v ? paintOf(v.state) : null
  const count = paint ? paint.colors.length : 0
  return (
    <li className="h-card" data-testid="project-card" data-kind={p.kind}>
      {p.room
        ? <RoomThumb room={p.room} variants={p.variants} onOpen={() => open(p)} label={`Ouvrir ${p.name}`} />
        : v && <Thumb doc={v.state} ratio="3 / 2" onOpen={() => open(p)} label={`Ouvrir ${p.name}`} />}
      {/* bande des couleurs, proportionnelle aux surfaces ; le fond du mur ferme la bande */}
      <div className="h-strip" aria-hidden>
        {paint?.colors.map((c) => <i key={c.colorId} style={{ background: c.hex, flexGrow: c.area }} />)}
        {paint && v && paint.background > 1 && <i style={{ background: v.state.background.hex, flexGrow: paint.background }} />}
      </div>
      <div className="tx">
        <h3 title={p.name}>{p.name}</h3>
        <p data-testid="project-kind">{describe(p)}</p>
        {paint && count > 0 && <p>{plural(count, 'couleur')}, {litres(paint.liters)} L de&nbsp;peinture</p>}
        <p><Variants p={p} />, modifié&nbsp;le&nbsp;{fmtDate(p.updatedAt)}</p>
        <p className={`h-copy ${state}`}>{BACKUP_LABEL[state]}</p>
      </div>
      <div className="h-acts card-actions">
        {p.kind === 'both' && <button className="h-btn sm quiet" data-testid="open-wall" onClick={() => navigate(`/v/${flatVariant(p)!.id}`)}>2D</button>}
        <button className="h-btn sm quiet" onClick={() => open(p)} data-testid={p.room ? 'open-room' : undefined}>Ouvrir</button>
        <button className="h-btn sm quiet" onClick={() => backup(p)} aria-label={`Télécharger une copie de secours de ${p.name}`}><Icon name="down" size={16} /> Télécharger</button>
        <Menu p={p} remove={remove} toRoom={toRoom} toWall={toWall} />
      </div>
    </li>
  )
}

/** Actions rares d'un projet. Un élément details : utilisable au clavier, refermé par Échap ou un clic ailleurs. */
function Menu({ p, remove, toRoom, toWall }: { p: Row } & Pick<CardActions, 'remove' | 'toRoom' | 'toWall'>) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current
      if (!el?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) {
        el.open = false
        if (e instanceof KeyboardEvent) el.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close) }
  }, [])
  const run = (action: () => void) => () => { if (ref.current) ref.current.open = false; action() }
  return (
    <details className="h-more" ref={ref}>
      <summary className="h-btn sm quiet icon" aria-label={`Autres actions pour ${p.name}`} data-testid="project-menu">
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill="currentColor"><circle cx="4.5" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="15.5" cy="10" r="1.4" /></svg>
      </summary>
      <div className="h-menu">
        {flatVariant(p) && <button onClick={run(() => navigate(`/p/${p.id}`))}>Voir les variantes</button>}
        {!p.room && <button onClick={run(() => toRoom(p))} data-testid="convert-room" title="Le mur 2D est conservé et son dessin est copié dans la pièce">Ajouter une pièce 3D</button>}
        {p.kind === 'room' && <button onClick={run(() => toWall(p))} data-testid="add-wall-2d">Ajouter un mur 2D</button>}
        <hr />
        <button className="danger" onClick={run(() => remove(p))} aria-label={`Supprimer ${p.name}`}>Supprimer le projet…</button>
      </div>
    </details>
  )
}

/** Création d'un mur ; les actions du projet permettent ensuite d'ajouter une pièce. */
function NewProject({ collapsible, onError }: { collapsible: boolean; onError: (e: unknown) => void }) {
  const [name, setName] = useState('')
  const [w, setW] = useState(DEFAULT_WALL.w)
  const [h, setH] = useState(DEFAULT_WALL.h)
  const [opened, setOpened] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    try {
      const { variant } = await repo.createProject(name.trim() || 'Nouveau mur', { w: Math.max(10, w), h: Math.max(10, h) })
      navigate(`/v/${variant.id}`)
    } catch (err) { onError(err) }
  }

  return (
    <section className="h-band" aria-labelledby="h-t-new">
      <form className={`h-new h-wrap${collapsible && !opened ? ' folded' : ''}`} onSubmit={create} data-testid="new-project-form">
        <div className="h-new-head">
          <h2 id="h-t-new">Nouveau projet</h2>
          <input ref={nameInput} aria-label="Nom du projet" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Salon, mur du fond" name="name" />
        </div>
        <label className="h-field f-n">Largeur du mur
          <span className="h-unit"><input type="number" inputMode="numeric" min={10} value={w} onChange={(e) => setW(+e.target.value)} name="width" /></span>
        </label>
        <label className="h-field f-n">Hauteur du mur
          <span className="h-unit"><input type="number" inputMode="numeric" min={10} value={h} onChange={(e) => setH(+e.target.value)} name="height" /></span>
        </label>
        <button type="submit" className="h-btn"><Icon name="plus" size={16} /> Créer le projet</button>
        <button type="button" className="h-btn quiet h-unfold" onClick={() => { setOpened(true); setTimeout(() => nameInput.current?.focus()) }}><Icon name="plus" size={16} /> Nouveau projet</button>
      </form>
    </section>
  )
}

function Privacy() {
  const cloud = localStorage.getItem('frsque:account-mode') === 'cloud'
  return (
    <section className="h-privacy h-privacy--columns" aria-label="Confidentialité">
      <div className="h-promises h-wrap">
        <ul>
          <li><Icon name="user" size={28} /><span>{cloud ? 'Compte synchronisé' : 'Sans compte obligatoire'}</span></li>
          <li><Icon name="device" size={28} /><span>{cloud ? 'Copie locale' : 'Tes projets en local'}</span></li>
          <li><Icon name="eyeOff" size={28} /><span>Sans pistage</span></li>
        </ul>
      </div>
    </section>
  )
}
