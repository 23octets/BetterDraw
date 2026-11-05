import { useModal } from './useModal'
import { storageError } from '../store/storage'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { db } from '../store/db'
import { storeImage } from '../store/images'
import type { ImageEdit, Rect, StoredImage, Vec } from '../model/types'
import { applyH, homography, isConvexQuad } from '../geometry/homography'
import { clampCrop, cropToDataUrl, defaultEdit, imageCornersPx, placement, planFor, renderCorrected } from '../store/imageEdit'
import { Icon } from './icons'

type Tab = 'perspective' | 'crop'
const LOUPE = 150
const ZOOM = 3

/** Convertit un événement pointeur en coordonnées de l'image affichée (px source). */
function toImg(e: { clientX: number; clientY: number }, el: Element, size: { w: number; h: number }): Vec {
  const r = el.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h }
}

export function ImageEditModal({ imageId, onClose }: { imageId: string; onClose: () => void }) {
  useModal('[data-testid=image-edit-modal]', onClose)
  const img = useEditor((s) => s.doc.images.find((i) => i.id === imageId))!
  const [source, setSource] = useState<StoredImage | null>(null)
  const [tab, setTab] = useState<Tab>('perspective')
  const [quad, setQuad] = useState<Vec[] | null>(null)
  const [useReal, setUseReal] = useState(!!img.edit?.realSize)
  const [realW, setRealW] = useState(String(img.edit?.realSize?.w ?? ''))
  const [realH, setRealH] = useState(String(img.edit?.realSize?.h ?? ''))
  const [crop, setCrop] = useState<Rect | null>(null)
  const [corrected, setCorrected] = useState<{ url: string; w: number; h: number; key: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const imgEl = useRef<HTMLImageElement | null>(null)
  const loupe = useRef<HTMLCanvasElement>(null)

  // image d'origine + réglages actuels
  const [baseEdit, setBaseEdit] = useState<ImageEdit | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const current = await db.images.get(img.blobId)
      if (!current) return
      const edit = img.edit ?? defaultEdit(img, current)
      const src = (await db.images.get(edit.sourceBlobId)) ?? current
      if (!alive) return
      setBaseEdit(edit)
      setSource(src)
      setQuad(edit.quad.map((p) => ({ ...p })))
      setCrop({ ...edit.crop })
      const el = new Image()
      el.src = src.dataUrl
      imgEl.current = el
    })()
    return () => {
      alive = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const realSize = useMemo(() => {
    const w = parseFloat(realW.replace(',', '.'))
    const h = parseFloat(realH.replace(',', '.'))
    return useReal && w > 0 && h > 0 ? { w, h } : null
  }, [useReal, realW, realH])

  const valid = quad ? isConvexQuad(quad) : false
  const plan = useMemo(() => {
    if (!source || !quad || !valid) return null
    try {
      return planFor(source, quad, realSize)
    } catch {
      return null
    }
  }, [source, quad, realSize, valid])
  const full = plan ? plan.full : source ? { w: source.width, h: source.height } : null
  const planKey = JSON.stringify([quad, realSize])

  // aperçu corrigé pour le recadrage
  useEffect(() => {
    if (tab !== 'crop' || !source || !valid || corrected?.key === planKey) return
    let alive = true
    setBusy(true)
    renderCorrected(source.dataUrl, plan).then((canvas) => {
      if (!alive) return
      setCorrected({ url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height, key: planKey })
      // nouvelle géométrie : on repart d'un recadrage sur toute l'image
      const sameGeometry = baseEdit && full && baseEdit.full.w === full.w && baseEdit.full.h === full.h
      if (!sameGeometry || !crop) setCrop({ x: 0, y: 0, w: canvas.width, h: canvas.height })
      setBusy(false)
    })
    return () => {
      alive = false
    }
  }, [tab, planKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Échap ferme la fenêtre, où que soit le focus

  // loupe : agrandit la zone autour du coin déplacé
  useEffect(() => {
    const c = loupe.current
    const el = imgEl.current
    if (!c || dragIdx === null || !quad || !el) return
    const ctx = c.getContext('2d')!
    const p = quad[dragIdx]
    const half = LOUPE / ZOOM / 2
    ctx.clearRect(0, 0, LOUPE, LOUPE)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(el, p.x - half, p.y - half, half * 2, half * 2, 0, 0, LOUPE, LOUPE)
    ctx.strokeStyle = '#e0007a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LOUPE / 2, 0); ctx.lineTo(LOUPE / 2, LOUPE)
    ctx.moveTo(0, LOUPE / 2); ctx.lineTo(LOUPE, LOUPE / 2)
    ctx.stroke()
  }, [dragIdx, quad])

  if (!source || !quad || !crop || !full || !baseEdit) {
    return (
      <div className="modal-backdrop">
        <div className="modal modal-image" role="dialog" aria-label="Ajuster l’image" data-testid="image-edit-modal"><div className="modal-pad">Chargement…</div></div>
      </div>
    )
  }

  // grille de contrôle dans le quadrilatère (4 × 4)
  const gridLines: [Vec, Vec][] = []
  if (valid) {
    const H = homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], quad)
    for (let k = 1; k < 4; k++) {
      gridLines.push([applyH(H, { x: k / 4, y: 0 }), applyH(H, { x: k / 4, y: 1 })])
      gridLines.push([applyH(H, { x: 0, y: k / 4 }), applyH(H, { x: 1, y: k / 4 })])
    }
  }
  const handleR = Math.max(source.width, source.height) / 70

  const apply = async () => {
    if (useEditor.getState().saveError) return setError('Sauvegardez le dessin affiché puis rechargez avant de poursuivre.')
    if (!valid) return setError('Les 4 coins doivent former un quadrilatère sans croisement.')
    setBusy(true)
    try {
      const canvas = await renderCorrected(source.dataUrl, plan)
      const c = clampCrop(crop, { w: canvas.width, h: canvas.height })
      const out = cropToDataUrl(canvas, c)
      const stored = await storeImage(out.dataUrl, { width: out.width, height: out.height })
      const nextEdit: ImageEdit = {
        sourceBlobId: baseEdit.sourceBlobId,
        quad,
        realSize,
        full: { w: canvas.width, h: canvas.height },
        rect: plan ? plan.rect : { x: 0, y: 0, w: canvas.width, h: canvas.height },
        crop: c,
      }
      const pos = placement(img, baseEdit, nextEdit)
      useEditor.getState().commit(`Ajuster l'image ${img.name}`, (d) => {
        const im = d.images.find((i) => i.id === imageId)
        if (im) Object.assign(im, { blobId: stored.id, edit: nextEdit, ...pos })
      })
      onClose()
    } catch (e) {
      setError(storageError(e))
      setBusy(false)
    }
  }

  const reset = () => {
    setQuad(imageCornersPx(source))
    setUseReal(false)
    setCrop({ x: 0, y: 0, w: source.width, h: source.height })
    setCorrected(null)
  }

  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="modal modal-image" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ajuster l’image" data-testid="image-edit-modal">
        <header className="modal-head">
          <strong>Ajuster l’image</strong>
          <div className="seg" role="tablist" style={{ marginLeft: 16 }}>
            <button className={tab === 'perspective' ? 'on' : ''} onClick={() => setTab('perspective')} data-testid="tab-perspective">Perspective</button>
            <button className={tab === 'crop' ? 'on' : ''} onClick={() => valid && setTab('crop')} disabled={!valid} data-testid="tab-crop">Recadrer</button>
          </div>
          <div className="spacer" />
          <button className="icon-btn ghost" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        </header>
        <div className="image-edit-body">
          <div className="image-stage">
            {tab === 'perspective' ? (
              <div className="stage-fit"><div className="stage-box" style={{ ['--ar' as string]: source.width / source.height }}>
                <img src={source.dataUrl} alt="" draggable={false} />
                <svg
                  viewBox={`0 0 ${source.width} ${source.height}`}
                  data-testid="perspective-overlay"
                  onPointerMove={(e) => {
                    if (dragIdx === null) return
                    const p = toImg(e, e.currentTarget, { w: source.width, h: source.height })
                    setQuad((q) => q!.map((v, i) => (i === dragIdx ? p : v)))
                  }}
                  onPointerUp={() => setDragIdx(null)}
                >
                  <polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} className={`quad${valid ? '' : ' invalid'}`} />
                  {gridLines.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="quad-grid" />)}
                  {quad.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={handleR}
                      className="quad-handle"
                      data-testid={`quad-${i}`}
                      onPointerDown={(e) => {
                        e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId)
                        setDragIdx(i)
                      }}
                    />
                  ))}
                </svg>
                {dragIdx !== null && <canvas ref={loupe} width={LOUPE} height={LOUPE} className="loupe" />}
              </div></div>
            ) : corrected && !busy ? (
              <CropStage url={corrected.url} size={{ w: corrected.w, h: corrected.h }} crop={crop} onChange={setCrop} />
            ) : (
              <div className="stage-loading">Correction en cours…</div>
            )}
          </div>
          <aside className="image-edit-side">
            {tab === 'perspective' ? (
              <>
                <h4>Perspective</h4>
                <p className="hint">Place les 4 ronds sur les coins d’un élément rectangulaire de la photo (le mur, une fenêtre, un cadre). L’image entière est redressée pour que ce rectangle soit droit.</p>
                <label className="check">
                  <input type="checkbox" checked={useReal} onChange={(e) => setUseReal(e.target.checked)} data-testid="use-real-size" />
                  Je connais ses dimensions réelles
                </label>
                {useReal && (
                  <div className="row">
                    <label className="field"><span>Largeur (cm)</span><input value={realW} onChange={(e) => setRealW(e.target.value)} data-testid="real-w" /></label>
                    <label className="field"><span>Hauteur (cm)</span><input value={realH} onChange={(e) => setRealH(e.target.value)} data-testid="real-h" /></label>
                  </div>
                )}
                <p className="hint">{useReal ? 'Proportions exactes, et l’image est mise à l’échelle du mur.' : 'Sans dimensions, les proportions sont estimées d’après la photo.'}</p>
                {!valid && <p className="hint error">Les coins se croisent : remets-les dans l’ordre (haut-gauche, haut-droit, bas-droit, bas-gauche).</p>}
              </>
            ) : (
              <>
                <h4>Recadrer</h4>
                <p className="hint">Tire les poignées pour ne garder qu’une partie de l’image. Glisse le cadre pour le déplacer.</p>
                <p className="hint" data-testid="crop-size">{Math.round(crop.w)} × {Math.round(crop.h)} px</p>
                <button className="wide" onClick={() => corrected && setCrop({ x: 0, y: 0, w: corrected.w, h: corrected.h })}>Toute l’image</button>
                {plan && (
                  <button className="wide" data-testid="crop-to-rect" onClick={() => setCrop({ ...plan.rect })}>Seulement le rectangle corrigé</button>
                )}
              </>
            )}
            {error && <p className="hint error">{error}</p>}
            <div className="spacer" />
            <button className="ghost wide" onClick={reset}>Réinitialiser (image d’origine)</button>
            <div className="row">
              <button onClick={onClose}>Annuler</button>
              <button className="primary" onClick={apply} disabled={busy || !valid} data-testid="apply-image-edit">{busy ? '…' : 'Appliquer'}</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/** Cadre de recadrage avec 8 poignées. */
function CropStage({ url, size, crop, onChange }: { url: string; size: { w: number; h: number }; crop: Rect; onChange: (r: Rect) => void }) {
  const drag = useRef<{ kind: string; start: Vec; orig: Rect } | null>(null)
  const r = Math.max(size.w, size.h) / 80
  const handles: [string, number, number][] = [
    ['nw', crop.x, crop.y], ['n', crop.x + crop.w / 2, crop.y], ['ne', crop.x + crop.w, crop.y],
    ['e', crop.x + crop.w, crop.y + crop.h / 2], ['se', crop.x + crop.w, crop.y + crop.h],
    ['s', crop.x + crop.w / 2, crop.y + crop.h], ['sw', crop.x, crop.y + crop.h], ['w', crop.x, crop.y + crop.h / 2],
  ]
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const p = toImg(e, e.currentTarget, size)
    const dx = p.x - d.start.x
    const dy = p.y - d.start.y
    const o = d.orig
    let { x, y, w, h } = o
    if (d.kind === 'move') {
      x = Math.max(0, Math.min(size.w - w, o.x + dx))
      y = Math.max(0, Math.min(size.h - h, o.y + dy))
    } else {
      if (d.kind.includes('w')) { x = Math.min(o.x + o.w - 8, Math.max(0, o.x + dx)); w = o.x + o.w - x }
      if (d.kind.includes('e')) w = Math.max(8, Math.min(size.w - o.x, o.w + dx))
      if (d.kind.includes('n')) { y = Math.min(o.y + o.h - 8, Math.max(0, o.y + dy)); h = o.y + o.h - y }
      if (d.kind.includes('s')) h = Math.max(8, Math.min(size.h - o.y, o.h + dy))
    }
    onChange({ x, y, w, h })
  }
  return (
    <div className="stage-fit"><div className="stage-box checker" style={{ ['--ar' as string]: size.w / size.h }}>
      <img src={url} alt="" draggable={false} />
      <svg viewBox={`0 0 ${size.w} ${size.h}`} onPointerMove={move} onPointerUp={() => (drag.current = null)} data-testid="crop-overlay">
        <path className="crop-shade" fillRule="evenodd" d={`M0 0H${size.w}V${size.h}H0Z M${crop.x} ${crop.y}v${crop.h}h${crop.w}v${-crop.h}Z`} />
        <rect
          x={crop.x} y={crop.y} width={crop.w} height={crop.h} className="crop-frame" data-testid="crop-frame"
          onPointerDown={(e) => {
            e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId)
            drag.current = { kind: 'move', start: toImg(e, e.currentTarget.ownerSVGElement!, size), orig: crop }
          }}
        />
        {[1, 2].map((k) => (
          <g key={k} className="crop-thirds">
            <line x1={crop.x + (crop.w * k) / 3} x2={crop.x + (crop.w * k) / 3} y1={crop.y} y2={crop.y + crop.h} />
            <line y1={crop.y + (crop.h * k) / 3} y2={crop.y + (crop.h * k) / 3} x1={crop.x} x2={crop.x + crop.w} />
          </g>
        ))}
        {handles.map(([k, x, y]) => (
          <rect
            key={k} x={x - r} y={y - r} width={2 * r} height={2 * r} className={`crop-handle h-${k}`} data-testid={`crop-${k}`}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId)
              drag.current = { kind: k, start: toImg(e, e.currentTarget.ownerSVGElement!, size), orig: crop }
            }}
          />
        ))}
      </svg>
    </div></div>
  )
}
