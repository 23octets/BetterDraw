import { useEffect, useState } from 'react'
import { useEditor } from '../store/editor'
import * as repo from '../store/repo'
import { Canvas } from './Canvas'
import { navigate } from './router'
import { GridSection, WallSection } from './SidePanel'
import { Toolbar } from './Toolbar'
import { HistoryPanel } from './HistoryPanel'
import { SelectionSection } from './SelectionSection'
import { PaletteSection, SurfacesSection } from './PaintSections'
import { copySelection, duplicateSelection, pasteClipboard } from '../tools/select'
import type { Project } from '../model/types'

export function Editor({ variantId }: { variantId: string }) {
  const load = useEditor((s) => s.load)
  const variant = useEditor((s) => s.variant)
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    let alive = true
    load(variantId).then(async (ok) => {
      if (!alive) return
      setStatus(ok ? 'ok' : 'missing')
      const v = useEditor.getState().variant
      if (v) setProject((await repo.getProject(v.projectId)) ?? null)
    })
    return () => {
      alive = false
    }
  }, [variantId, load])

  useShortcuts()

  if (status === 'missing') {
    return (
      <div className="missing">
        <p>Ce dessin n'existe pas (ou plus).</p>
        <button onClick={() => navigate('/')}>Retour aux projets</button>
      </div>
    )
  }
  if (status === 'loading' || !variant) return <div className="loading">Chargement…</div>

  return (
    <div className="editor">
      <TopBar projectName={project?.name ?? ''} />
      <Toolbar />
      <main className="stage">
        <Canvas />
        <StatusBar />
      </main>
      <aside className="side-panel">
        <SideTabs />
      </aside>
    </div>
  )
}

function SideTabs() {
  const [tab, setTab] = useState<'props' | 'history'>('props')
  return (
    <>
      <div className="side-tabs" role="tablist">
        <button role="tab" className={tab === 'props' ? 'on' : ''} aria-selected={tab === 'props'} onClick={() => setTab('props')} data-testid="tab-props">Propriétés</button>
        <button role="tab" className={tab === 'history' ? 'on' : ''} aria-selected={tab === 'history'} onClick={() => setTab('history')} data-testid="tab-history">Historique</button>
      </div>
      {tab === 'props' ? (
        <>
          <SelectionSection />
          <PaletteSection />
          <SurfacesSection />
          <WallSection />
          <GridSection />
        </>
      ) : (
        <HistoryPanel />
      )}
    </>
  )
}

function TopBar({ projectName }: { projectName: string }) {
  const variant = useEditor((s) => s.variant)!
  const saving = useEditor((s) => s.saving)
  const headSeq = useEditor((s) => s.headSeq)
  const maxSeq = useEditor((s) => s.maxSeq)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const mode = useEditor((s) => s.mode)
  const setMode = useEditor((s) => s.setMode)
  return (
    <header className="topbar">
      <button className="ghost" onClick={() => navigate('/')} title="Retour aux projets">← Projets</button>
      <div className="title">
        <strong data-testid="project-name">{projectName}</strong>
        <span className="muted">{variant.name}</span>
      </div>
      <div className="seg" role="group" aria-label="Mode d'affichage">
        <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')} data-testid="mode-edit">Édition</button>
        <button className={mode === 'render' ? 'on' : ''} onClick={() => setMode('render')} data-testid="mode-render">Rendu</button>
        <button className={mode === 'consult' ? 'on' : ''} onClick={() => setMode('consult')} data-testid="mode-consult">Consultation</button>
      </div>
      <div className="spacer" />
      <button className="ghost" onClick={() => undo()} disabled={headSeq <= 0} title="Annuler (⌘Z)" data-testid="undo">↶</button>
      <button className="ghost" onClick={() => redo()} disabled={headSeq >= maxSeq} title="Rétablir (⇧⌘Z)" data-testid="redo">↷</button>
      <span className={`save-state${saving ? ' busy' : ''}`} data-testid="save-state">{saving ? 'Enregistrement…' : 'Enregistré'}</span>
    </header>
  )
}

function StatusBar() {
  const view = useEditor((s) => s.view)
  const message = useEditor((s) => s.message)
  const tool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  return (
    <div className="statusbar">
      {message ? (
        <span className={`flash ${message.kind}`} data-testid="flash">{message.text}</span>
      ) : (
        <span className="tool-hint" data-testid="tool-hint">{TOOL_HINTS[mode === 'edit' ? tool : 'consult'] ?? ''}</span>
      )}
      <div className="spacer" />
      <button className="ghost small" onClick={() => window.dispatchEvent(new Event('bd:fit'))} data-testid="fit">Ajuster</button>
      <span className="muted" data-testid="zoom">{Math.round(view.zoom * 100) / 100} px/cm</span>
    </div>
  )
}

const TOOL_HINTS: Record<string, React.ReactNode> = {
  select: <>Clic : sélectionner · <kbd>⇧</kbd> ajouter · glisser : déplacer · <kbd>Suppr</kbd> effacer</>,
  polyline: <>Clic : poser un point · <kbd>A</kbd> arc tangent · tape une longueur puis <kbd>Entrée</kbd> · <kbd>⇧</kbd> 45° · <kbd>Alt</kbd> sans aimant · double-clic / <kbd>Entrée</kbd> : terminer</>,
  arc: <>Clic : départ, puis arrivée, puis point de passage · tape une longueur pour la corde</>,
  bezier: <>Clic : point anguleux · cliquer-glisser : point lisse · clic sur le 1er point : fermer · <kbd>Entrée</kbd> : terminer</>,
  fill: <>Clic dans une zone fermée pour la peindre · <kbd>Alt</kbd>+clic : ignorer les trous</>,
  erase: <>Clic sur une zone peinte pour retirer sa couleur</>,
  pick: <>Clic sur une zone peinte pour reprendre sa couleur</>,
  measure: <>Clic sur deux points pour mesurer · <kbd>Échap</kbd> : effacer</>,
  consult: <>Clic sur une case pour zoomer</>,
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const s = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
      } else if (mod && e.key.toLowerCase() === 'c' && s.mode === 'edit') {
        if (copySelection()) e.preventDefault()
      } else if (mod && e.key.toLowerCase() === 'v' && s.mode === 'edit') {
        e.preventDefault()
        s.setTool('select')
        pasteClipboard()
      } else if (mod && e.key.toLowerCase() === 'd' && s.mode === 'edit') {
        e.preventDefault()
        duplicateSelection()
      } else if (mod && e.key.toLowerCase() === 'a' && s.mode === 'edit') {
        e.preventDefault()
        s.setTool('select')
        s.setSelection(s.doc.shapes.map((x) => x.id))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
