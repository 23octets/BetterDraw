import { useModal } from './useModal'
import { useMemo, useState } from 'react'
import { useEditor, flushPersistence, hasUnsavedWork } from '../store/editor'
import { exportPages, type ExportMeta } from '../export/svg'
import { recoveryFile } from '../export/recovery'
import { serializeProject } from '../export/project'
import { gridLayout } from '../geometry/grid'
import { togglePrintCell } from '../tools/consult'
import { DocPreview } from './DocPreview'

export function ExportDialog({ meta, onClose }: { meta: ExportMeta; onClose: () => void }) {
  useModal('[data-testid=export-dialog]', onClose)
  const saveError = useEditor((s) => s.saveError)
  const doc = useEditor((s) => s.doc)
  const room = useEditor((s) => s.room)
  const variant = useEditor((s) => s.variant)!
  const [busy, setBusy] = useState<string | null>(null)
  const pages = useMemo(() => exportPages(doc, meta, room), [doc, meta, room])
  const L = gridLayout(doc.wall, doc.grid)
  const run = async (what: string, fn: () => Promise<unknown> | unknown) => {
    setBusy(what)
    try {
      if ((await fn()) !== false) useEditor.getState().flash(`${what} : téléchargé`)
    } catch (e) {
      useEditor.getState().flash(`${what} : échec (${(e as Error).message})`, 'error')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Exporter" data-testid="export-dialog">
        <header className="modal-head">
          <strong>Exporter</strong>
          <div className="spacer" />
          <button className="ghost" onClick={onClose} aria-label="Fermer">✕</button>
        </header>
        <div className="modal-body">
          <div className="export-left">
            <h3>Cases à détailler</h3>
            <p className="hint">Clique sur les cases complexes pour les imprimer en grand. Ces pages sont des références agrandies, pas des patrons à l’échelle 1:1. Reporte le dessin avec les cotes et la grille.</p>
            <div className="cell-picker" style={{ aspectRatio: `${doc.wall.w} / ${doc.wall.h}` }}>
              <DocPreview doc={doc} showGrid className="cell-picker-svg" />
              <svg className="cell-picker-hit" viewBox={`0 0 ${doc.wall.w} ${doc.wall.h}`} preserveAspectRatio="none">
                {L.cells.map((c) => (
                  <g key={c.id} role="button" tabIndex={0} aria-label={`Imprimer la case ${c.id}`} aria-pressed={doc.printCells.includes(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePrintCell(c.id) } }} onClick={() => togglePrintCell(c.id)} className={`pick-cell${doc.printCells.includes(c.id) ? ' on' : ''}`} data-testid={`pick-${c.id}`}>
                    <rect x={c.x} y={c.y} width={c.w} height={c.h} />
                    <text x={c.x + c.w / 2} y={c.y + c.h / 2} fontSize={Math.min(c.w, c.h) / 3.2} textAnchor="middle" dominantBaseline="middle">{c.id}</text>
                  </g>
                ))}
              </svg>
            </div>
            <div className="export-actions">
              <button className="primary" disabled={!!busy} data-testid="export-pdf" onClick={() => run('PDF chantier', async () => (await import('../export/pdf')).exportPdf(doc, meta, room))}>
                {busy === 'PDF chantier' ? 'Génération…' : `Télécharger le PDF (${pages.length} page${pages.length > 1 ? 's' : ''})`}
              </button>
              <button disabled={!!busy} data-testid="export-png" onClick={() => run('PNG', async () => (await import('../export/pdf')).exportPng(doc, meta, 3508, room))}>Image PNG</button>
              <button disabled={!!busy} data-testid="export-svg" onClick={() => run('SVG', async () => (await import('../export/pdf')).exportSvg(doc, meta, room))}>Vectoriel SVG</button>
              <button disabled={!!busy} data-testid="export-json" onClick={() => run('Sauvegarde du projet', async () => {
                await flushPersistence()
                const data = hasUnsavedWork() ? await recoveryFile() : await serializeProject(variant.projectId)
                if (data.warnings?.length && !window.confirm(data.warnings.join('\n') + '\nTélécharger cette sauvegarde incomplète ?')) return false
                const { download, safeName } = await import('../export/pdf')
                download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeName(meta.project)}.frsque.json`)
              })}>Sauvegarde du projet (.json)</button>
            </div>
            {saveError && <p className="hint">Pour conserver les modifications non enregistrées, utilisez la sauvegarde JSON de secours ou celle proposée dans l’alerte.</p>}
            <p className="hint">Les images de référence ne sont jamais incluses dans le PDF, le PNG ni le SVG.</p>
          </div>
          <div className="export-pages" data-testid="export-pages">
            {pages.map((p, i) => (
              <figure key={i} className="page-preview" data-testid="page-preview">
                {/* rendu via <img> : aucun script d'un SVG ne peut s'y exécuter */}
                <img className="page-svg" alt={`Page ${i + 1}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(p)}`} />
                <figcaption>{i === 0 ? 'Page 1 · vue d’ensemble' : `Page ${i + 1}`}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
