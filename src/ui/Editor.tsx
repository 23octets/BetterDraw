import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import * as repo from '../store/repo'
import { Canvas } from './Canvas'
import { navigate } from './router'
import { GridSection } from './SidePanel'
import { SettingsModal } from './SettingsModal'
import { Toolbar, TOOLS } from './Toolbar'
import { Icon } from './icons'
import { MeasureBar } from './MeasureBar'
import { VariantsOverlay } from './VariantsOverlay'
import { TextField } from './fields'
import { GridMenu } from './GridMenu'
import { HistoryPanel } from './HistoryPanel'
import { ConsultPanel } from './ConsultPanel'
import { ExportDialog } from './ExportDialog'
import { ImagesSection } from './ImagesSection'
import { SelectionSection } from './SelectionSection'
import { BackgroundSection, PaletteSection } from './PaintSections'
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
  const mode = useEditor((s) => s.mode)
  const [exporting, setExporting] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
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
      <main className="stage">
        <Canvas />
        <CanvasOverlay />
        {(shortcuts || metaHeld) && <ShortcutsPanel />}
      </main>
      <aside className="side-panel">
        {mode === 'consult' ? <ConsultPanel onExport={() => setExporting(true)} /> : <SidePanelContent />}
      </aside>
      {exporting && <ExportDialog meta={{ project: project?.name ?? 'Projet', variant: variant.name, date: new Date().toLocaleDateString('fr-FR') }} onClose={() => setExporting(false)} />}
    </div>
  )
}

function SidePanelContent() {
  return (
    <>
      <SelectionSection />
      <PaletteSection />
      <BackgroundSection />
      <ImagesSection />
      <GridSection />
    </>
  )
}

/** Bouton Historique (à côté d'annuler / rétablir) : la frise s'ouvre dans un panneau déroulant. */
function HistoryButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const maxSeq = useEditor((s) => s.maxSeq)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  return (
    <div className="history-anchor" ref={ref}>
      <button className={`icon-btn${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="tab-history" title="Historique des modifications">
        <Icon name="clock" /> {maxSeq}
      </button>
      {open && (
        <div className="history-popover" data-testid="history-popover">
          <HistoryPanel />
        </div>
      )}
    </div>
  )
}

function VariantSwitcher() {
  const variant = useEditor((s) => s.variant)!
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(1)
  useEffect(() => {
    repo.listVariants(variant.projectId).then((l) => setCount(l.length))
  }, [variant.projectId, variant.id, open])
  return (
    <div className="variant-switcher">
      <span className="title-sep" aria-hidden>/</span>
      <TextField
        className="variant-title"
        value={variant.name}
        testId="variant-name-input"
        onCommit={async (name) => {
          await repo.renameVariant(variant.id, name)
          useEditor.setState((s) => (s.variant ? { variant: { ...s.variant, name } } : {}))
        }}
      />
      <button className={`icon-btn${open ? ' on' : ''}`} data-testid="variants-page" onClick={() => setOpen(true)} title="Variantes : créer une copie pour essayer une autre idée, passer de l'une à l'autre, comparer">
        <Icon name="layers" /> Variantes{count > 1 ? <span className="btn-badge">{count}</span> : null}
      </button>
      {open && <VariantsOverlay onClose={() => setOpen(false)} />}
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
  const [settings, setSettings] = useState(false)
  return (
    <header className="topbar">
      <button className="icon-btn ghost" onClick={() => navigate('/')} title="Retour aux projets"><Icon name="arrowLeft" size={16} /> Projets</button>
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
      <span className={`save-state${saving ? ' busy' : ''}`} data-testid="save-state">{saving ? 'Enregistrement…' : 'Enregistré'}</span>
      <button className={`icon-btn${shortcutsOpen ? ' on' : ''}`} onClick={onShortcuts} aria-pressed={shortcutsOpen} data-testid="toggle-shortcuts" title="Raccourcis clavier (maintenir ⌘)" aria-label="Raccourcis clavier">
        <Icon name="keyboard" /> Raccourcis
      </button>
      <button className="icon-btn" onClick={() => setSettings(true)} data-testid="open-settings" title="Réglages : taille du mur, origine, lignes de la grille" aria-label="Réglages">
        <Icon name="sliders" /> Réglages
      </button>
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      <div className="btn-group">
        <HistoryButton />
        <button className="icon-btn" onClick={() => undo()} disabled={headSeq <= 0} title="Annuler (⌘Z)" aria-label="Annuler" data-testid="undo"><Icon name="undo" /></button>
        <button className="icon-btn" onClick={() => redo()} disabled={headSeq >= maxSeq} title="Rétablir (⇧⌘Z)" aria-label="Rétablir" data-testid="redo"><Icon name="redo" /></button>
      </div>
      <button className="icon-btn" onClick={onExport} data-testid="export"><Icon name="export" /> Exporter</button>
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
      <div className="canvas-hud">
      <MeasureBar />
      <div className="zoom-controls hud-pill">
        <button className="icon-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Dézoomer"><Icon name="minus" /></button>
        <span className="zoom-value" data-testid="zoom">{Math.round(view.zoom * 100) / 100} px/cm</span>
        <button className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoomer"><Icon name="plus" /></button>
        <button className="icon-btn" onClick={() => window.dispatchEvent(new CustomEvent('bd:fit', { detail: null }))} data-testid="fit" title="Ajuster à l’écran"><Icon name="fit" /></button>
      </div>
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
