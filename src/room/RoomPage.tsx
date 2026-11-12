import { COMPACT_QUERY } from '../ui/compact'
import { storageError } from '../store/storage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import type { DocState, Opening, OpeningKind, Project, RoomGroup, RoomPlan, Variant, Vec, Wall } from '../model/types'
import * as repo from '../store/repo'
import * as rooms from '../store/rooms'
import type { WallInfo } from '../store/rooms'
import { navigate, registerNavigationGuard } from '../ui/router'
import { Icon } from '../ui/icons'
import { NumberField, TextField } from '../ui/fields'
import { DocPreview, Thumb } from '../ui/DocPreview'
import { FrescoImportDialog } from '../ui/FrescoImportDialog'
import { PlanEditor, type RoomSelection } from './PlanEditor'
import { Room3D } from './Room3D'
import type { WallPaint } from './scene3d'
import {
  OPENING_LABEL, clampOpening, cleanGroups, groupLayout, groupOf, type GroupLayout, isConvexCorner, moveCorner, toggleGlazedBase, windowBars, windowBase, windowCols, windowRows, type GrowSide, notchCorner, openingAt, fitOpenings, newOpening, normalizeOrientation, openingIssues, openingRect,
  perimeter, removeCorner, roomArea, selfIntersects, setWallLength, splitWall, wallLength,
} from './geometry'

type Layout = 'plan' | 'split' | '3d'

/** Mur 2D indépendant du projet (hors du plan), avec sa dernière variante. */
interface FlatWall { wall: Wall; latest: Variant | null }

async function loadFlatWall(projectId: string): Promise<FlatWall | null> {
  const wall = repo.standaloneWalls(await repo.listWalls(projectId))[0]
  if (!wall) return null
  const vs = (await repo.listVariants(projectId)).filter((v) => v.wallId === wall.id)
  return { wall, latest: [...vs].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null }
}

let saveQueue: Promise<unknown> = Promise.resolve()
async function flushRoomSaves() {
  let pending: Promise<unknown>
  do { pending = saveQueue; await pending } while (pending !== saveQueue)
}
/** Historique du plan, conservé pendant la session (aller peindre un mur puis revenir ne le perd pas). */
const histories = new Map<string, { past: RoomPlan[]; future: RoomPlan[] }>()
function historyOf(projectId: string) {
  let h = histories.get(projectId)
  if (!h) histories.set(projectId, (h = { past: [], future: [] }))
  return h
}

export function RoomPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined)
  const [room, setRoom] = useState<RoomPlan | null>(null)
  const [preview, setPreview] = useState<RoomPlan | null>(null)
  const [walls, setWalls] = useState<WallInfo[]>([])
  const [groups, setGroups] = useState<Map<string, WallInfo>>(new Map())
  const [flat, setFlat] = useState<FlatWall | null>(null)
  /** Mur (ou groupe de murs liés) qui reçoit une fresque importée. */
  const [importInto, setImportInto] = useState<number | null>(null)
  const live = useRef({ groups, walls })
  live.current = { groups, walls }
  /** Mode « lier des murs » : murs cochés, et groupe modifié (null = nouveau groupe). */
  const [linking, setLinking] = useState<{ ids: string[]; groupId: string | null } | null>(null)
  const [sel, setSel] = useState<RoomSelection>(null)
  const [layout, setLayout] = useState<Layout>(() => (localStorage.getItem('bd:room-layout') as Layout) || 'split')
  const [saving, setSaving] = useState(0)
  const [saveError, setSaveError] = useState('')
  const [rescueMessage, setRescueMessage] = useState('')
  const saveErrorRef = useRef('')
  useEffect(() => {
    const unregister = registerNavigationGuard(() => !!saveErrorRef.current, flushRoomSaves)
    const guard = (e: BeforeUnloadEvent) => {
      if (saveErrorRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', guard)
    return () => { unregister(); window.removeEventListener('beforeunload', guard) }
  }, [])
  const [msg, setMsg] = useState<string | null>(null)
  /** Côté qui s'allonge quand on change la longueur d'un mur. */
  const [grow, setGrow] = useState<GrowSide>(() => (localStorage.getItem('bd:room-grow') as GrowSide) || 'right')
  useEffect(() => localStorage.setItem('bd:room-grow', grow), [grow])
  const hist = historyOf(projectId)
  const [, bump] = useState(0)

  const refreshWalls = useCallback(async () => {
    const p = await repo.getProject(projectId)
    if (!p) return
    setWalls(await rooms.loadRoomWalls(p))
    setGroups(await rooms.loadRoomGroups(p))
    setFlat(await loadFlatWall(projectId))
  }, [projectId])

  useEffect(() => {
    ;(async () => {
      await saveQueue
      const p = await repo.getProject(projectId)
      if (!p?.room) return setProject(null)
      setProject(p)
      setRoom(p.room)
      setWalls(await rooms.loadRoomWalls(p))
      setGroups(await rooms.loadRoomGroups(p))
      setFlat(await loadFlatWall(projectId))
    })()
  }, [projectId])

  // peinture de chaque mur pour la 3D (un mur lié montre sa bande du dessin commun)
  const paints = useMemo<WallPaint[]>(() => {
    const r = preview ?? room
    if (!r) return []
    const key = (v: WallInfo['display']) => (v ? `${v.id}:${v.headSeq}:${v.updatedAt}:${v.state.wall.w}x${v.state.wall.h}` : '')
    return r.walls.map((rw) => {
      const g = groupOf(r, rw.id)
      const gv = g && groups.get(g.id)?.display
      if (g && gv) {
        const seg = groupLayout(r, g.walls).segs.find((s) => s.id === rw.id)
        const W = gv.state.wall.w
        if (seg && W > 0) return { doc: gv.state, key: key(gv), crop: { x: seg.x / W, w: Math.min(seg.len, W - seg.x) / W } }
      }
      const v = walls.find((x) => x.wall.id === rw.id)?.display ?? null
      return { doc: v?.state ?? null, key: key(v) }
    })
  }, [room, preview, walls, groups])

  useEffect(() => localStorage.setItem('bd:room-layout', layout), [layout])
  /** Part de la largeur donnée au plan en mode Plan + 3D (poignée déplaçable). */
  const [split, setSplit] = useState(() => {
    const v = parseFloat(localStorage.getItem('bd:room-split') ?? '')
    return Number.isFinite(v) ? Math.min(0.85, Math.max(0.15, v)) : 0.5
  })
  useEffect(() => localStorage.setItem('bd:room-split', String(split)), [split])
  const stageRef = useRef<HTMLElement>(null)

  const flash = (t: string) => {
    setMsg(t)
    setTimeout(() => setMsg((m) => (m === t ? null : m)), 3000)
  }

  const persist = (next: RoomPlan) => {
    setSaving((s) => s + 1)
    saveQueue = saveQueue
      .then(() => rooms.saveRoom(projectId, next))
      .then(() => { saveErrorRef.current = ''; setSaveError(''); return refreshWalls() })
      .catch((e) => {
        console.error(e)
        saveErrorRef.current = storageError(e)
        setSaveError(saveErrorRef.current)
      })
      .finally(() => setSaving((s) => s - 1))
  }

  /** Applique une modification du plan (une étape d'annulation). */
  const commit = (next: RoomPlan, _label = '') => {
    if (!room) return
    if (selfIntersects(next.pts)) {
      flash('Les murs ne peuvent pas se croiser')
      return
    }
    const fixed = cleanGroups(fitOpenings(normalizeOrientation(next)))
    hist.past.push(room)
    hist.future.length = 0
    setRoom(fixed)
    persist(fixed)
  }

  const undo = () => {
    if (!room || !hist.past.length) return
    hist.future.push(room)
    const r = hist.past.pop()!
    setRoom(r)
    persist(r)
    bump((x) => x + 1)
  }
  const redo = () => {
    if (!room || !hist.future.length) return
    hist.past.push(room)
    const r = hist.future.pop()!
    setRoom(r)
    persist(r)
    bump((x) => x + 1)
  }

  // garde la sélection valide après une modification
  useEffect(() => {
    if (!room || !sel) return
    if (sel.kind === 'corner' && sel.j >= room.pts.length) setSel(null)
    if ((sel.kind === 'wall' || sel.kind === 'opening') && sel.i >= room.walls.length) setSel(null)
    if (sel.kind === 'opening' && !room.walls[sel.i]?.openings.some((o) => o.id === sel.id)) setSel({ kind: 'wall', i: sel.i })
  }, [room, sel])

  const keys = useRef({ undo, redo, sel, room, commit })
  keys.current = { undo, redo, sel, room, commit }
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (window.matchMedia(COMPACT_QUERY).matches) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || document.pointerLockElement) return
      const { undo, redo, sel, room, commit } = keys.current
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && room && sel) {
        if (sel.kind === 'opening') {
          commit({ ...room, walls: room.walls.map((w, k) => (k === sel.i ? { ...w, openings: w.openings.filter((o) => o.id !== sel.id) } : w)) })
          setSel({ kind: 'wall', i: sel.i })
        } else if (sel.kind === 'corner' && room.pts.length > 3) {
          commit(removeCorner(room, sel.j))
          setSel(null)
        }
      } else if (e.key === 'Escape') {
        setSel(null)
        setLinking(null)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  if (project === undefined) return <div className="loading">Chargement…</div>
  if (project === null || !room)
    return (
      <div className="missing">
        <p>Pièce introuvable.</p>
        <button onClick={() => navigate('/')}>Retour</button>
      </div>
    )

  const shown = preview ?? room
  const names = room.walls.map((w, i) => walls.find((x) => x.wall.id === w.id)?.wall.name ?? `Mur ${i + 1}`)
  const colors = room.walls.map((w) => {
    const g = groupOf(room, w.id)
    const gv = g && groups.get(g.id)?.display
    return (gv ?? walls.find((x) => x.wall.id === w.id)?.display)?.state.background.hex ?? null
  })
  /** Dessin à montrer pour le mur i : le sien, ou sa bande du dessin de ses murs liés. */
  const wallView = (i: number): { doc: DocState; crop?: { x: number; w: number } } | null => {
    const rw = room.walls[i]
    const g = rw && groupOf(room, rw.id)
    const gv = g && groups.get(g.id)?.display
    if (g && gv) {
      const seg = groupLayout(room, g.walls).segs.find((s) => s.id === rw.id)
      if (seg) return { doc: gv.state, crop: { x: seg.x, w: seg.len } }
    }
    const v = wallsInOrder[i]?.display
    return v ? { doc: v.state } : null
  }
  // les dessins suivent la taille du plan (avant la fin de l'enregistrement)
  const wallsInOrder = room.walls.map((w) => walls.find((x) => x.wall.id === w.id) ?? { wall: { id: w.id, projectId, name: '' }, variants: [], display: null })
  const selectedWall = sel && (sel.kind === 'wall' || sel.kind === 'opening') ? sel.i : null

  const openWall = (i: number) => {
    const id = room.walls[i]?.id
    if (!id) return
    const g = groupOf(room, id)
    // après l'enregistrement en cours : les dessins (et ceux des murs liés) sont à jour
    saveQueue.then(() => {
      const v = g ? live.current.groups.get(g.id)?.display : live.current.walls.find((x) => x.wall.id === id)?.display
      if (v) navigate(`/v/${v.id}`)
    })
  }

  /** Vue 2D : le mur sélectionné, sinon le mur 2D du projet, sinon le premier mur. */
  const open2d = () => {
    if (selectedWall !== null) return openWall(selectedWall)
    if (flat?.latest) return navigate(`/v/${flat.latest.id}`)
    openWall(0)
  }
  const addFlatWall = async () => {
    try {
      const v = await rooms.addStandaloneWall(projectId)
      navigate(`/v/${v.id}`)
    } catch (e) { flash(storageError(e)) }
  }
  /** Surface peinte par le mur i (son groupe s'il est lié) : cible d'un import de fresque. */
  const importTarget = (i: number) => {
    const rw = room.walls[i]
    const g = groupOf(room, rw.id)
    if (g) return { id: g.id, name: groups.get(g.id)?.wall.name ?? 'Murs liés', size: { w: groupLayout(room, g.walls).width, h: room.height } }
    return { id: rw.id, name: names[i], size: { w: Math.round(wallLength(room, i) * 10) / 10, h: room.height } }
  }

  const startLink = (i: number) => {
    const g = groupOf(room, room.walls[i].id)
    setLinking({ ids: g ? [...g.walls] : [room.walls[i].id], groupId: g?.id ?? null })
    setSel(null)
  }
  const toggleLink = (i: number) =>
    setLinking((l) => l && { ...l, ids: l.ids.includes(room.walls[i].id) ? l.ids.filter((x) => x !== room.walls[i].id) : [...l.ids, room.walls[i].id] })
  const unlink = (groupId: string) => commit({ ...room, groups: (room.groups ?? []).filter((g) => g.id !== groupId) })
  const confirmLink = async () => {
    if (!linking) return
    const { ids, groupId } = linking
    setLinking(null)
    const others = (room.groups ?? []).filter((g) => g.id !== groupId).map((g) => ({ ...g, walls: g.walls.filter((x) => !ids.includes(x)) }))
    if (ids.length < 2) {
      if (groupId) unlink(groupId)
      return
    }
    let group: RoomGroup
    if (groupId) group = { id: groupId, walls: ids }
    else {
      setSaving((x) => x + 1)
      try {
        await saveQueue
        group = await rooms.createWallGroup(projectId, room, ids)
      } catch (e) { flash(storageError(e)); return } finally {
        setSaving((x) => x - 1)
      }
    }
    commit({ ...room, groups: [...others, group] })
    const first = room.walls.findIndex((w) => w.id === groupLayout(room, ids).segs[0]?.id)
    if (first >= 0) setSel({ kind: 'wall', i: first })
  }

  return (
    <div className={`room-page layout-${layout}`}>
      <header className="topbar">
        <button className="icon-btn ghost" onClick={() => navigate('/')} title="Retour aux projets"><Icon name="arrowLeft" size={16} /> Projets</button>
        <div className="title">
          <TextField className="project-title" value={project.name} testId="room-title" onCommit={async (name) => {
            try { await repo.renameProject(project.id, name) } catch (e) { alert(storageError(e)); return }
            setProject({ ...project, name })
          }} />
        </div>
        <div className="seg" role="group" aria-label="Affichage">
          <button className={layout === 'plan' ? 'on' : ''} onClick={() => setLayout('plan')} data-testid="layout-plan">Plan</button>
          <button className={layout === 'split' ? 'on' : ''} onClick={() => setLayout('split')} data-testid="layout-split">Plan + 3D</button>
          <button className={layout === '3d' ? 'on' : ''} onClick={() => setLayout('3d')} data-testid="layout-3d">3D</button>
          <button onClick={open2d} data-testid="layout-2d" title={selectedWall !== null ? `Dessiner ${names[selectedWall]} en 2D` : flat?.latest ? 'Ouvrir le mur 2D du projet' : `Dessiner ${names[0]} en 2D (ou sélectionne d’abord un mur)`}>2D</button>
        </div>
        <div className="spacer" />
        <span className={`save-state${saveError ? ' error' : saving ? ' busy' : ''}`} data-testid="room-save-state">{saveError ? 'Échec de l’enregistrement' : saving ? 'Enregistrement…' : 'Enregistré'}</span>
        <div className="btn-group">
          <button className="icon-btn" onClick={undo} disabled={!hist.past.length} title="Annuler (⌘Z)" aria-label="Annuler" data-testid="room-undo"><Icon name="undo" /></button>
          <button className="icon-btn" onClick={redo} disabled={!hist.future.length} title="Rétablir (⇧⌘Z)" aria-label="Rétablir" data-testid="room-redo"><Icon name="redo" /></button>
        </div>
      </header>
      <div className="mobile-notice">
        <p>L’édition du plan et la vue 3D interactive nécessitent un ordinateur. Pour consulter le décor et ses cotes, ouvrez un mur :</p>
        <nav className="mobile-room-walls" aria-label="Consulter les murs">
          {names.map((name, i) => <button key={room.walls[i].id} onClick={() => openWall(i)}>Consulter {name}</button>)}
        </nav>
      </div>
      <main className="room-stage" ref={stageRef} style={layout === 'split' ? { gridTemplateColumns: `minmax(0, ${split}fr) 0px minmax(0, ${1 - split}fr)` } : undefined}>
        {layout !== '3d' && (
          <PlanEditor
            room={shown}
            names={names}
            colors={colors}
            selection={sel}
            grow={grow}
            linking={linking?.ids ?? null}
            onToggleLink={toggleLink}
            onSelect={setSel}
            onPreview={setPreview}
            onCommit={commit}
            onPlace={(i, kind, u, free) => {
              const o = openingAt(kind, u, wallLength(room, i), room.height, free)
              commit({ ...room, walls: room.walls.map((w, k) => (k === i ? { ...w, openings: [...w.openings, o] } : w)) })
              setSel({ kind: 'opening', i, id: o.id })
            }}
            onNotch={(j) => {
              commit(notchCorner(room, j, [nanoid(10), nanoid(10)]))
              setSel({ kind: 'corner', j: j + 1 })
            }}
            onSplit={(i, at) => {
              commit(splitWall(room, i, nanoid(10), at))
              setSel({ kind: 'corner', j: i + 1 })
            }}
          />
        )}
        {layout === 'split' && (
          <div
            className="room-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Séparation entre le plan et la 3D"
            aria-valuenow={Math.round(split * 100)}
            tabIndex={0}
            title="Glisser pour redimensionner · double-clic : moitié-moitié"
            data-testid="room-splitter"
            onPointerDown={(e) => {
              const el = e.currentTarget
              el.setPointerCapture(e.pointerId)
              el.classList.add('dragging')
              const move = (ev: PointerEvent) => {
                const r = stageRef.current!.getBoundingClientRect()
                setSplit(Math.min(0.85, Math.max(0.15, (ev.clientX - r.left) / r.width)))
              }
              const up = () => {
                el.classList.remove('dragging')
                el.removeEventListener('pointermove', move)
                el.removeEventListener('pointerup', up)
                el.removeEventListener('pointercancel', up)
              }
              el.addEventListener('pointermove', move)
              el.addEventListener('pointerup', up)
              el.addEventListener('pointercancel', up)
            }}
            onDoubleClick={() => setSplit(0.5)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setSplit((v) => Math.max(0.15, v - 0.05))
              if (e.key === 'ArrowRight') setSplit((v) => Math.min(0.85, v + 0.05))
            }}
          />
        )}
        {layout !== 'plan' && (
          <Room3D room={shown} paints={paints} selected={selectedWall} onPick={(i, open) => {
            if (linking) {
              if (i !== null) toggleLink(i)
              return
            }
            if (i === null) setSel(null)
            else if (open) openWall(i)
            else setSel({ kind: 'wall', i })
          }} />
        )}
        {saveError && <div className="storage-failure" role="alert">
          {rescueMessage && <p>{rescueMessage}</p>}
          <p>{saveError} Les dernières modifications du plan ne sont pas enregistrées.</p>
          <button onClick={() => { if (room) persist(room) }}>Réessayer l’enregistrement</button>
          <button onClick={async () => {
            try {
              const { rescueRoom } = await import('../store/rescue')
              const { data, warning } = await rescueRoom(project!, room!)
              setRescueMessage(warning || 'Sauvegarde du plan affiché téléchargée.')
              const { download, safeName } = await import('../export/pdf')
              download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeName(project?.name ?? 'Pièce')}.secours.frsque.json`)
              flash('Sauvegarde du plan affiché téléchargée.')
            } catch (e) { flash(storageError(e)) }
          }}>Sauvegarder le plan affiché (.json)</button>
          <button onClick={() => navigate('/')}>Accueil et sauvegardes</button>
        </div>}
        {msg && <div className="toast error"  role="status" data-testid="room-flash">{msg}</div>}
      </main>
      <aside className="side-panel">
        {linking ? (
          <LinkPanel room={room} names={names} ids={linking.ids} editing={!!linking.groupId} onToggle={toggleLink} onCancel={() => setLinking(null)} onConfirm={confirmLink} />
        ) : sel?.kind === 'corner' ? (
          <CornerPanel room={room} j={sel.j} onCommit={commit} onClose={() => setSel(null)} onNotch={() => {
            commit(notchCorner(room, sel.j, [nanoid(10), nanoid(10)]))
            setSel({ kind: 'corner', j: sel.j + 1 })
          }} />
        ) : selectedWall !== null && room.walls[selectedWall] ? (
          <WallPanel
            room={room}
            i={selectedWall}
            info={wallsInOrder[selectedWall]}
            view={wallView(selectedWall)}
            name={names[selectedWall]}
            group={groupOf(room, room.walls[selectedWall].id) ?? null}
            names={names}
            onLink={() => startLink(selectedWall)}
            onUnlink={(id) => unlink(id)}
            selectedOpening={sel?.kind === 'opening' ? sel.id : null}
            onSelectOpening={(id) => setSel(id ? { kind: 'opening', i: selectedWall, id } : { kind: 'wall', i: selectedWall })}
            onCommit={commit}
            onFlash={flash}
            grow={grow}
            onGrow={setGrow}
            onClose={() => setSel(null)}
            onPaint={() => openWall(selectedWall)}
            onRename={async (name) => {
              try { await rooms.renameWall(room.walls[selectedWall].id, name) } catch (e) { alert(storageError(e)); return }
              refreshWalls()
            }}
            onDisplay={async (vid) => {
              try { await rooms.setDisplayVariant(room.walls[selectedWall].id, vid) } catch (e) { alert(storageError(e)); return }
              refreshWalls()
            }}
            onSplit={() => {
              commit(splitWall(room, selectedWall, nanoid(10)))
              setSel({ kind: 'corner', j: selectedWall + 1 })
            }}
            onImport={() => setImportInto(selectedWall)}
          />
        ) : (
          <RoomSettings flat={flat} onOpenFlat={() => flat?.latest && navigate(`/v/${flat.latest.id}`)} onAddFlat={addFlatWall} room={room} walls={wallsInOrder} wallView={wallView} names={names} onCommit={commit} onToggleLock={(i) => commit({ ...room, walls: room.walls.map((w, k) => (k === i ? { ...w, locked: !w.locked } : w)) })} onSelect={(i) => setSel({ kind: 'wall', i })} onPaint={openWall} />
        )}
      </aside>
      {importInto !== null && room.walls[importInto] && (() => {
        const t = importTarget(importInto)
        return (
          <FrescoImportDialog
            target={{ projectId, wallId: t.id, size: t.size }}
            targetName={t.name}
            onClose={() => setImportInto(null)}
            onDone={async (v) => {
              setImportInto(null)
              await refreshWalls()
              flash(`Fresque copiée dans ${t.name} (variante « ${v.name} »)`)
            }}
          />
        )
      })()}
    </div>
  )
}

function RoomSettings({ flat, onOpenFlat, onAddFlat, room, wallView, names, onCommit, onToggleLock, onSelect, onPaint }: { flat: FlatWall | null; onOpenFlat: () => void; onAddFlat: () => void; room: RoomPlan; walls: WallInfo[]; wallView: (i: number) => { doc: DocState; crop?: { x: number; w: number } } | null; names: string[]; onCommit: (r: RoomPlan) => void; onToggleLock: (i: number) => void; onSelect: (i: number) => void; onPaint: (i: number) => void }) {
  const wallArea = room.walls.reduce((s, w, i) => s + wallLength(room, i) * room.height - w.openings.reduce((a, o) => a + o.w * o.h, 0), 0)
  return (
    <>
      <section className="panel-section" data-testid="room-settings">
        <h3>Pièce</h3>
        <div className="row">
          <NumberField label="Hauteur sous plafond" suffix="cm" min={100} max={1000} value={room.height} testId="room-height" onCommit={(height) => onCommit({ ...room, height })} />
          <NumberField label="Épaisseur des murs" suffix="cm" min={2} max={100} value={room.thickness} testId="room-thickness" onCommit={(thickness) => onCommit({ ...room, thickness })} />
        </div>
        <label className="field floor-field">
          <span>Sol</span>
          <input type="color" value={room.floor} onChange={(e) => onCommit({ ...room, floor: e.target.value })} data-testid="room-floor" />
        </label>
        <p className="hint" data-testid="room-stats">
          Sol : {(roomArea(room) / 10000).toFixed(2)} m² · périmètre : {(perimeter(room) / 100).toFixed(2)} m<br />
          Murs (hors ouvertures) : {(wallArea / 10000).toFixed(2)} m²
        </p>
      </section>
      <section className="panel-section">
        <h3>Portes et fenêtres</h3>
        <p className="hint">Choisis <strong>Porte</strong> ou <strong>Fenêtre</strong> en haut du plan, puis clique sur un mur à l’endroit voulu. Tu peux aussi sélectionner un mur : ses ouvertures se règlent au centimètre dans ce panneau.</p>
        <h3>Forme</h3>
        <p className="hint"><strong>Décroché en L</strong> entaille un angle de la pièce ; glisse ensuite l’angle rentrant pour régler le L. Double-clic sur un mur : ajouter un angle.</p>
      </section>
      <section className="panel-section">
        <h3>Murs <span className="muted">{room.walls.length}</span></h3>
        <p className="hint">Les murs sont vus de l’intérieur de la pièce : la gauche du dessin est à gauche quand on fait face au mur.</p>
        <ul className="room-walls">
          {room.walls.map((w, i) => {
            const view = wallView(i)
            const linked = !!groupOf(room, w.id)
            return (
              <li key={w.id} className="room-wall-item" data-testid="room-wall-item">
                <button className="room-wall-thumb" onClick={() => onSelect(i)} title={`Sélectionner ${names[i]}`}>
                  {view ? <WallElevation doc={view.doc} crop={view.crop} openings={w.openings} height={room.height} /> : <span className="muted">…</span>}
                </button>
                <div className="room-wall-meta">
                  <strong>{names[i]}{w.locked && <Icon name="lock" size={12} />}</strong>
                  <span className="muted small">{Math.round(wallLength(room, i) * 10) / 10} cm{w.openings.length ? ` · ${w.openings.length} ouverture${w.openings.length > 1 ? 's' : ''}` : ''}{linked ? ' · lié' : ''}</span>
                </div>
                <button className={`icon-btn ghost small lock-btn${w.locked ? ' on' : ''}`} onClick={() => onToggleLock(i)} aria-pressed={!!w.locked} title={w.locked ? 'Longueur verrouillée : cliquer pour déverrouiller' : 'Verrouiller la longueur de ce mur'} data-testid={`lock-wall-${i}`}><Icon name={w.locked ? 'lock' : 'unlock'} size={14} /></button>
                <button className="small" onClick={() => onPaint(i)} data-testid={`paint-wall-${i}`}><Icon name="fill" size={14} /> Peindre</button>
              </li>
            )
          })}
        </ul>
      </section>
      <section className="panel-section" data-testid="flat-wall">
        <h3>Mur 2D</h3>
        {flat ? (
          <>
            <p className="hint">Mur indépendant de la pièce, dessiné à plat.</p>
            {flat.latest && <Thumb doc={flat.latest.state} onOpen={onOpenFlat} label={`Ouvrir ${flat.wall.name}`} />}
            <button className="wide" onClick={onOpenFlat} disabled={!flat.latest} data-testid="open-flat-wall"><Icon name="fill" size={14} /> Ouvrir le mur 2D</button>
          </>
        ) : (
          <>
            <p className="hint">Ajoute un mur dessiné à plat, indépendant du plan : une fresque à essayer avant de la poser dans la pièce, par exemple.</p>
            <button className="wide" onClick={onAddFlat} data-testid="add-flat-wall"><Icon name="plus" size={14} /> Ajouter un mur 2D</button>
          </>
        )}
      </section>
    </>
  )
}

/** Dessin du mur avec ses ouvertures en surimpression. */
export function WallElevation({ doc, openings, height, crop }: { doc: DocState; openings: Opening[]; height: number; crop?: { x: number; w: number } }) {
  const x0 = crop?.x ?? 0, w = crop?.w ?? doc.wall.w
  const pad = Math.max(w, doc.wall.h) * 0.01
  return (
    <div className="wall-elevation">
      <DocPreview doc={doc} showGrid={false} className="wall-elevation-svg" margin={0.01} crop={crop} />
      <svg className="wall-elevation-svg overlay" viewBox={`${x0 - pad} ${-pad} ${w + pad * 2} ${doc.wall.h + pad * 2}`} preserveAspectRatio="xMidYMid meet">
        {openings.map((o0) => {
          // ouvertures du mur, placées dans sa bande du dessin
          const o = { ...o0, x: o0.x + x0 }
          const r = openingRect(o, height)
          return (
            <g key={o.id}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} className={`elev-opening ${o.kind}`} />
              {windowBars(o, height).map(([x1, y1, x2, y2], k) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} className="elev-bar" />)}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function WallPanel(props: {
  room: RoomPlan
  i: number
  info: WallInfo
  view: { doc: DocState; crop?: { x: number; w: number } } | null
  name: string
  group: RoomGroup | null
  names: string[]
  onLink: () => void
  onUnlink: (groupId: string) => void
  selectedOpening: string | null
  onSelectOpening: (id: string | null) => void
  onCommit: (r: RoomPlan) => void
  onFlash: (t: string) => void
  grow: GrowSide
  onGrow: (g: GrowSide) => void
  onClose: () => void
  onPaint: () => void
  onRename: (n: string) => void
  onDisplay: (variantId: string) => void
  onSplit: () => void
  onImport: () => void
}) {
  const { room, i, info } = props
  const rw = room.walls[i]
  const len = wallLength(room, i)
  const issues = openingIssues(room, i)
  const setOpenings = (ops: Opening[]) => props.onCommit({ ...room, walls: room.walls.map((w, k) => (k === i ? { ...w, openings: ops } : w)) })
  const patch = (id: string, p: Partial<Opening>) => setOpenings(rw.openings.map((o) => (o.id === id ? clampOpening({ ...o, ...p }, len, room.height) : o)))
  const add = (kind: OpeningKind) => {
    const o = newOpening(kind, len, room.height, rw.openings)
    setOpenings([...rw.openings, o])
    props.onSelectOpening(o.id)
  }
  return (
    <>
      <section className="panel-section" data-testid="wall-panel">
        <div className="panel-head">
          <button className="icon-btn ghost small" onClick={props.onClose} title="Retour à la pièce" aria-label="Retour à la pièce"><Icon name="arrowLeft" size={15} /></button>
          <TextField className="wall-name" value={props.name} testId="wall-name" onCommit={props.onRename} />
        </div>
        {props.view && (
          <button className="room-wall-big" onClick={props.onPaint} title="Peindre ce mur">
            <WallElevation doc={props.view.doc} crop={props.view.crop} openings={rw.openings} height={room.height} />
          </button>
        )}
        <button className="primary wide" onClick={props.onPaint} disabled={!props.view} data-testid="paint-wall"><Icon name="fill" size={15} /> {props.group ? 'Peindre les murs liés' : 'Peindre ce mur'}</button>
        <button className="small wide" onClick={props.onImport} data-testid="import-fresco" title="Copier ici une fresque d’un autre mur ou d’un autre projet (nouvelle variante)"><Icon name="copy" size={14} /> Importer une fresque…</button>
        <div className="link-box" data-testid="link-box">
          {props.group ? (
            <>
              <p className="hint">
                <strong>Peinture continue</strong> avec{' '}
                {groupLayout(room, props.group.walls).segs.filter((s) => s.i !== i).map((s) => props.names[s.i]).join(', ')} : un seul dessin, murs côte à côte.
              </p>
              <div className="row">
                <button className="small" onClick={props.onLink} data-testid="edit-link">Modifier les murs liés</button>
                <button className="small" onClick={() => props.onUnlink(props.group!.id)} data-testid="unlink" title="Chaque mur retrouve son propre dessin (le dessin commun reste dans l’historique : ⌘Z)">Délier</button>
              </div>
            </>
          ) : (
            <button className="small wide" onClick={props.onLink} data-testid="link-walls" title="Peindre ce mur et d’autres sur un seul dessin continu">
              <Icon name="plus" size={14} /> Lier à d’autres murs (peinture continue)
            </button>
          )}
        </div>
        <div className="row length-row">
          <NumberField label="Longueur" suffix="cm" min={20} max={5000} value={Math.round(len * 10) / 10} testId="wall-length" disabled={!!rw.locked} onCommit={(l) => {
            const r = setWallLength(room, i, l, props.grow)
            if (r) props.onCommit(r)
            else props.onFlash('Impossible : les murs qui devraient bouger sont verrouillés')
          }} />
          <button className={`icon-btn lock-btn${rw.locked ? ' on' : ''}`} onClick={() => props.onCommit({ ...room, walls: room.walls.map((w, k) => (k === i ? { ...w, locked: !w.locked } : w)) })} aria-pressed={!!rw.locked} title={rw.locked ? 'Déverrouiller la longueur' : 'Verrouiller la longueur : les autres modifications du plan ne la changeront plus'} data-testid="lock-wall">
            <Icon name={rw.locked ? 'lock' : 'unlock'} size={15} />
          </button>
        </div>
        {!rw.locked && (
          <div className="field">
            <span>En changeant la longueur, le mur s’allonge…</span>
            <div className="seg grow-seg" role="group" aria-label="Sens d’agrandissement">
              <button className={props.grow === 'left' ? 'on' : ''} onClick={() => props.onGrow('left')} data-testid="grow-left" title="Le coin de droite reste fixe">← à gauche</button>
              <button className={props.grow === 'both' ? 'on' : ''} onClick={() => props.onGrow('both')} data-testid="grow-both" title="Le milieu du mur reste fixe">↔ des deux côtés</button>
              <button className={props.grow === 'right' ? 'on' : ''} onClick={() => props.onGrow('right')} data-testid="grow-right" title="Le coin de gauche reste fixe">à droite →</button>
            </div>
          </div>
        )}
        {rw.locked && <p className="hint">Longueur verrouillée : déplacer un angle de ce mur le déplace en entier, et les autres murs absorbent les changements.</p>}
        <button className="small" onClick={props.onSplit} data-testid="split-wall" title="Coupe le mur en deux pour créer un décrochement"><Icon name="plus" size={14} /> Ajouter un angle au milieu</button>
        {info.variants.length > 1 && (
          <label className="field">
            <span>Variante affichée en 3D</span>
            <select value={info.display?.id} onChange={(e) => props.onDisplay(e.target.value)} data-testid="display-variant">
              {info.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        )}
      </section>
      <section className="panel-section" data-testid="openings">
        <h3>Portes et fenêtres</h3>
        <div className="row">
          <button onClick={() => add('door')} data-testid="add-door"><Icon name="plus" size={14} /> Porte</button>
          <button onClick={() => add('window')} data-testid="add-window"><Icon name="plus" size={14} /> Fenêtre</button>
        </div>
        {!rw.openings.length && <p className="hint">Aucune ouverture sur ce mur. Ajoute une porte ou une fenêtre, puis glisse-la sur le plan pour la placer.</p>}
        {issues.map((t) => <p key={t} className="hint warn">{t}</p>)}
        {[...rw.openings].sort((a, b) => a.x - b.x).map((o) => {
          const on = props.selectedOpening === o.id
          return (
            <div key={o.id} className={`opening-card${on ? ' on' : ''}`} data-testid={`opening-${o.kind}`} onClick={() => props.onSelectOpening(o.id)}>
              <div className="opening-head">
                <strong>{OPENING_LABEL[o.kind]}</strong>
                <span className="muted small">{o.w} × {o.h} cm</span>
                <div className="spacer" />
                <button className="icon-btn ghost small danger" aria-label={`Supprimer ${OPENING_LABEL[o.kind]}`} data-testid="delete-opening" onClick={(e) => {
                  e.stopPropagation()
                  setOpenings(rw.openings.filter((x) => x.id !== o.id))
                  props.onSelectOpening(null)
                }}><Icon name="trash" size={14} /></button>
              </div>
              <div className="row">
                <NumberField label="Depuis la gauche" suffix="cm" min={0} max={len} value={o.x} testId="opening-x" onCommit={(x) => patch(o.id, { x })} />
                <NumberField label="Largeur" suffix="cm" min={10} max={len} value={o.w} testId="opening-w" onCommit={(w) => patch(o.id, { w })} />
              </div>
              <div className="row">
                <NumberField label="Hauteur" suffix="cm" min={10} max={room.height} value={o.h} testId="opening-h" onCommit={(h) => patch(o.id, { h })} />
                {o.kind === 'window' ? (
                  <NumberField label="Allège (du sol)" suffix="cm" min={0} max={room.height} value={o.sill} testId="opening-sill" onCommit={(sill) => patch(o.id, { sill })} />
                ) : <span />}
              </div>
              {o.kind === 'window' && (
                <>
                  <div className="row">
                    <NumberField label="Colonnes de carreaux" min={1} max={12} value={windowCols(o)} testId="opening-cols" onCommit={(cols) => patch(o.id, { cols })} />
                    <NumberField label="Lignes de carreaux" min={1} max={12} value={windowRows(o)} testId="opening-rows" onCommit={(rows) => patch(o.id, { rows })} />
                  </div>
                  <label className="check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={windowBase(o) > 0} data-testid="opening-base-toggle" onChange={(e) => {
                      const next = toggleGlazedBase(o, e.target.checked)
                      setOpenings(rw.openings.map((x) => (x.id === o.id ? clampOpening(next, len, room.height) : x)))
                    }} />
                    Soubassement vitré (la fenêtre descend jusqu’en bas, partie basse fixe)
                  </label>
                  {windowBase(o) > 0 && (
                    <NumberField label="Hauteur du soubassement" suffix="cm" min={10} max={o.h - 20} value={windowBase(o)} testId="opening-base" onCommit={(base) => patch(o.id, { base })} />
                  )}
                </>
              )}
            </div>
          )
        })}
      </section>
    </>
  )
}

function CornerPanel({ room, j, onCommit, onClose, onNotch }: { room: RoomPlan; j: number; onCommit: (r: RoomPlan) => void; onClose: () => void; onNotch: () => void }) {
  const p = room.pts[j]
  if (!p) return null
  const move = (q: Partial<Vec>) => onCommit(moveCorner(room, j, { ...p, ...q }))
  return (
    <section className="panel-section" data-testid="corner-panel">
      <div className="panel-head">
        <button className="icon-btn ghost small" onClick={onClose} aria-label="Retour à la pièce"><Icon name="arrowLeft" size={15} /></button>
        <strong>Angle {j + 1}</strong>
      </div>
      <div className="row">
        <NumberField label="X" suffix="cm" value={p.x} testId="corner-x" onCommit={(x) => move({ x })} />
        <NumberField label="Y" suffix="cm" value={p.y} testId="corner-y" onCommit={(y) => move({ y })} />
      </div>
      {isConvexCorner(room, j) && (
        <button onClick={onNotch} data-testid="notch-corner" title="Remplace l’angle par une encoche rentrante : la pièce prend une forme en L">
          <Icon name="plus" size={14} /> Faire un décroché ici (forme en L)
        </button>
      )}
      <button className="danger" disabled={room.pts.length <= 3} onClick={() => { onCommit(removeCorner(room, j)); onClose() }} data-testid="remove-corner">
        <Icon name="trash" size={14} /> Supprimer l’angle (fusionne les deux murs)
      </button>
      <p className="hint">Astuce : glisse l’angle directement sur le plan. Il s’aimante sur la grille (5 cm) et sur l’alignement des autres angles.</p>
    </section>
  )
}

/** Choix des murs à lier, avec l'aperçu du dessin déroulé. */
function LinkPanel({ room, names, ids, editing, onToggle, onCancel, onConfirm }: {
  room: RoomPlan
  names: string[]
  ids: string[]
  editing: boolean
  onToggle: (i: number) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const layout = groupLayout(room, ids)
  return (
    <section className="panel-section" data-testid="link-panel">
      <div className="panel-head">
        <button className="icon-btn ghost small" onClick={onCancel} aria-label="Annuler"><Icon name="arrowLeft" size={15} /></button>
        <strong>Murs liés : peinture continue</strong>
      </div>
      <p className="hint">
        Clique sur les murs du plan ou de la 3D (ou coche-les). Ils seront peints sur <strong>un seul dessin</strong>, côte à côte dans l’ordre du tour de la pièce.
        Deux murs qui se touchent sont collés ; entre deux murs séparés (une cheminée…), l’écart réel est gardé.
      </p>
      <ul className="link-list">
        {room.walls.map((w, i) => (
          <li key={w.id}>
            <label className="check">
              <input type="checkbox" checked={ids.includes(w.id)} onChange={() => onToggle(i)} data-testid={`link-check-${i}`} />
              {names[i]} <span className="muted small">{Math.round(wallLength(room, i) * 10) / 10} cm</span>
            </label>
          </li>
        ))}
      </ul>
      {layout.segs.length > 0 && <LinkStrip layout={layout} names={names} height={room.height} />}
      <div className="row">
        <button onClick={onCancel}>Annuler</button>
        <button className="primary" onClick={onConfirm} disabled={!editing && layout.segs.length < 2} data-testid="link-confirm">
          {layout.segs.length < 2 ? (editing ? 'Délier' : 'Lier') : `Lier ${layout.segs.length} murs`}
        </button>
      </div>
      {!editing && <p className="hint">Les dessins actuels des murs sont recopiés dans le dessin commun. Délier rend à chaque mur son propre dessin.</p>}
    </section>
  )
}

function LinkStrip({ layout, names, height }: { layout: GroupLayout; names: string[]; height: number }) {
  const W = Math.max(1, layout.width)
  const fs = W / 22
  return (
    <div className="link-strip" data-testid="link-preview">
      <svg viewBox={`${-W * 0.01} ${-fs * 1.6} ${W * 1.02} ${height * 0.5 + fs * 3.4}`} preserveAspectRatio="xMidYMid meet">
        {layout.segs.map((s) => (
          <g key={s.id}>
            <rect x={s.x} y={0} width={s.len} height={height * 0.5} className="link-seg" />
            <text x={s.x + s.len / 2} y={height * 0.25} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(fs, s.len / 3.2)} className="link-seg-name">{names[s.i]}</text>
            <text x={s.x + s.len / 2} y={height * 0.5 + fs * 1.3} textAnchor="middle" fontSize={fs * 0.85} className="link-dim">{s.len}</text>
          </g>
        ))}
        {layout.gaps.map((g, k) => (
          <g key={k}>
            <rect x={g.x} y={0} width={g.w} height={height * 0.5} className="link-gap" />
            <text x={g.x + g.w / 2} y={-fs * 0.4} textAnchor="middle" fontSize={fs * 0.85} className="link-dim">↔ {g.w}</text>
          </g>
        ))}
      </svg>
      <p className="muted small">Dessin commun : {layout.width} × {height} cm</p>
    </div>
  )
}
