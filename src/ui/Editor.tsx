import { useEffect, useState } from 'react'
import { useEditor, flushPersistence } from '../store/editor'
import * as repo from '../store/repo'
import { Canvas } from './Canvas'
import { navigate } from './router'
import { GridSection, WallSection } from './SidePanel'
import { Toolbar, TOOLS } from './Toolbar'
import { Icon } from './icons'
import { MeasureBar } from './MeasureBar'
import { GridMenu } from './GridMenu'
import { HistoryPanel } from './HistoryPanel'
import { ConsultPanel } from './ConsultPanel'
import { ExportDialog } from './ExportDialog'
import { ImagesSection } from './ImagesSection'
import { SelectionSection } from './SelectionSection'
import { BackgroundSection, PaletteSection } from './PaintSections'
import { copySelection, duplicateSelection, pasteClipboard } from '../tools/select'
import type { Project, Variant } from '../model/types'

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
  const mode = useEditor((s) => s.mode)
  const [exporting, setExporting] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const tool = useEditor((s) => s.tool)
  const metaHeld = useMetaHeld()

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
      <TopBar projectName={project?.name ?? ''} onExport={() => setExporting(true)} onShortcuts={() => setShortcuts((x) => !x)} shortcutsOpen={shortcuts} />
      <Toolbar />
      <main className={`stage${tool === 'measure' ? ' has-footer' : ''}`}>
        <Canvas />
        <CanvasOverlay />
        <MeasureBar />
        {(shortcuts || metaHeld) && <ShortcutsPanel />}
      </main>
      <aside className="side-panel">
        {mode === 'consult' ? <ConsultPanel onExport={() => setExporting(true)} /> : <SideTabs />}
      </aside>
      {exporting && <ExportDialog meta={{ project: project?.name ?? 'Projet', variant: variant.name, date: new Date().toLocaleDateString('fr-FR') }} onClose={() => setExporting(false)} />}
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
          <BackgroundSection />
          <ImagesSection />
          <WallSection />
          <GridSection />
        </>
      ) : (
        <HistoryPanel />
      )}
    </>
  )
}

function VariantSwitcher() {
  const variant = useEditor((s) => s.variant)!
  const [list, setList] = useState<Variant[]>([])
  useEffect(() => {
    repo.listVariants(variant.projectId).then(setList)
  }, [variant.projectId, variant.id])
  return (
    <div className="variant-switcher">
      <select
        value={variant.id}
        data-testid="variant-select"
        onChange={(e) => navigate(`/v/${e.target.value}`)}
        title="Changer de variante"
      >
        {list.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
      <button
        className="small"
        data-testid="snapshot"
        title="Snapshot : dupliquer ce dessin en une nouvelle variante indépendante"
        onClick={async () => {
          await flushPersistence()
          const nv = await repo.snapshotVariant(variant.id)
          navigate(`/v/${nv.id}`)
          setTimeout(() => useEditor.getState().flash(`${nv.name} créée à partir de ${variant.name}`), 50)
        }}
      >
        ⧉ Snapshot
      </button>
      <button className="ghost small" data-testid="variants-page" onClick={() => navigate(`/p/${variant.projectId}`)}>
        Variantes & comparaison
      </button>
    </div>
  )
}

function TopBar({ projectName, onExport, onShortcuts, shortcutsOpen }: { projectName: string; onExport: () => void; onShortcuts: () => void; shortcutsOpen: boolean }) {
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
        <VariantSwitcher />
      </div>
      <div className="seg" role="group" aria-label="Mode d'affichage">
        <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')} data-testid="mode-edit">Édition</button>
        <button className={mode === 'render' ? 'on' : ''} onClick={() => setMode('render')} data-testid="mode-render">Rendu</button>
        <button className={mode === 'consult' ? 'on' : ''} onClick={() => setMode('consult')} data-testid="mode-consult">Consultation</button>
      </div>
      <GridMenu />
      <div className="spacer" />
      <button className={`icon-btn${shortcutsOpen ? ' on' : ''}`} onClick={onShortcuts} aria-pressed={shortcutsOpen} data-testid="toggle-shortcuts" title="Raccourcis clavier (maintenir ⌘)">
        <Icon name="keyboard" /> Raccourcis
      </button>
      <div className="btn-group">
        <button className="icon-btn" onClick={() => undo()} disabled={headSeq <= 0} title="Annuler (⌘Z)" aria-label="Annuler" data-testid="undo"><Icon name="undo" /></button>
        <button className="icon-btn" onClick={() => redo()} disabled={headSeq >= maxSeq} title="Rétablir (⇧⌘Z)" aria-label="Rétablir" data-testid="redo"><Icon name="redo" /></button>
      </div>
      <button className="icon-btn" onClick={onExport} data-testid="export"><Icon name="export" /> Exporter</button>
      <span className={`save-state${saving ? ' busy' : ''}`} data-testid="save-state">{saving ? 'Enregistrement…' : 'Enregistré'}</span>
    </header>
  )
}

/** Notification flottante + zoom / ajuster, posés sur l'espace de travail. */
function CanvasOverlay() {
  const view = useEditor((s) => s.view)
  const message = useEditor((s) => s.message)
  const zoomBy = (k: number) => {
    const st = useEditor.getState()
    const el = document.querySelector('[data-testid=canvas]')!.getBoundingClientRect()
    const cx = el.width / 2, cy = el.height / 2
    const z = Math.max(0.05, Math.min(80, st.view.zoom * k))
    st.setView({ zoom: z, panX: cx - ((cx - st.view.panX) / st.view.zoom) * z, panY: cy - ((cy - st.view.panY) / st.view.zoom) * z })
  }
  return (
    <>
      {message && <div className={`toast ${message.kind}`} data-testid="flash" role="status">{message.text}</div>}
      <div className="zoom-controls">
        <button className="icon-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Dézoomer"><Icon name="minus" /></button>
        <span className="zoom-value" data-testid="zoom">{Math.round(view.zoom * 100) / 100} px/cm</span>
        <button className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoomer"><Icon name="plus" /></button>
        <button className="icon-btn" onClick={() => window.dispatchEvent(new CustomEvent('bd:fit', { detail: null }))} data-testid="fit" title="Ajuster à l’écran"><Icon name="fit" /></button>
      </div>
    </>
  )
}

const K = ({ children }: { children: React.ReactNode }) => <kbd className="key">{children}</kbd>

const TOOL_TIPS: Partial<Record<string, [React.ReactNode, string][]>> = {
  select: [[<><K>Clic</K></>, 'sélectionner'], [<><K>⇧</K><K>Clic</K></>, 'ajouter à la sélection'], [<><K>⌫</K></>, 'supprimer'], [<><K>←</K><K>→</K><K>↑</K><K>↓</K></>, 'déplacer (⇧ ×10)']],
  polyline: [[<K>A</K>, 'arc tangent / droite'], [<><K>1</K><K>2</K><K>0</K><K>↵</K></>, 'longueur exacte'], [<><K>1</K><K>0</K><K>&lt;</K><K>4</K><K>5</K></>, 'longueur et angle'], [<K>⌫</K>, 'retirer le dernier point'], [<K>↵</K>, 'terminer']],
  bezier: [[<K>Glisser</K>, 'point lisse'], [<K>↵</K>, 'terminer'], [<K>⌫</K>, 'retirer le dernier point']],
  arc: [[<><K>1</K><K>2</K><K>0</K><K>↵</K></>, 'corde exacte'], [<K>Échap</K>, 'annuler']],
  trim: [[<K>Clic</K>, 'supprime le bout en rouge']],
  fill: [[<><K>⌥</K><K>Clic</K></>, 'peindre malgré un trou']],
  measure: [[<K>Échap</K>, 'effacer la mesure']],
  image: [[<K>Glisser</K>, 'déplacer'], [<K>Coin</K>, 'agrandir (proportions)']],
}

export function ShortcutsPanel() {
  const tool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  const tips = mode === 'edit' ? TOOL_TIPS[tool] : undefined
  const row = (keys: React.ReactNode, label: string, k: string | number) => (
    <li key={k}><span className="keys">{keys}</span><span>{label}</span></li>
  )
  return (
    <aside className="shortcuts" data-testid="shortcuts-panel" aria-label="Raccourcis clavier">
      <h4>Outils</h4>
      <ul>{TOOLS.map((t) => row(<K>{t.key.toUpperCase()}</K>, t.label, t.id))}</ul>
      {tips && (
        <>
          <h4>Outil actif</h4>
          <ul>{tips.map(([k, l], i) => row(k, l, i))}</ul>
        </>
      )}
      <h4>Tracé</h4>
      <ul>
        {row(<K>⇧</K>, 'angle par pas de 45°', 's')}
        {row(<K>⌥</K>, 'sans aimantage', 'a')}
        {row(<K>Espace</K>, 'glisser pour déplacer la vue', 'sp')}
        {row(<><K>⌘</K><K>Molette</K></>, 'zoomer', 'zw')}
      </ul>
      <h4>Édition</h4>
      <ul>
        {row(<><K>⌘</K><K>Z</K></>, 'annuler', 'z')}
        {row(<><K>⇧</K><K>⌘</K><K>Z</K></>, 'rétablir', 'y')}
        {row(<><K>⌘</K><K>C</K></>, 'copier', 'c')}
        {row(<><K>⌘</K><K>V</K></>, 'coller', 'v')}
        {row(<><K>⌘</K><K>D</K></>, 'dupliquer', 'd')}
        {row(<><K>⌘</K><K>A</K></>, 'tout sélectionner', 'aa')}
        {row(<K>Échap</K>, 'annuler / désélectionner', 'esc')}
      </ul>
      <h4>Consultation</h4>
      <ul>
        {row(<K>Clic</K>, 'zoomer / dézoomer une case', 'cc')}
        {row(<><K>←</K><K>→</K><K>↑</K><K>↓</K></>, 'case voisine', 'arr')}
      </ul>
      <p className="shortcuts-foot">Maintiens <K>⌘</K> pour afficher ce panneau.</p>
    </aside>
  )
}

/** Affiche les raccourcis tant que ⌘ est enfoncé (seul). */
function useMetaHeld() {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Meta') timer = setTimeout(() => setHeld(true), 350)
      else {
        clearTimeout(timer)
        setHeld(false)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Meta') {
        clearTimeout(timer)
        setHeld(false)
      }
    }
    const blur = () => {
      clearTimeout(timer)
      setHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return held
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const s = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'Escape' && s.mode === 'edit' && s.tool !== 'select') {
        // Échap non consommé par l'outil (rien en cours) : retour à l'outil de sélection
        s.setTool('select')
        return
      }
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
