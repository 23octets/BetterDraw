import type { DocState, RefImage } from '../model/types'
import { useImageUrl } from '../store/images'
import { useEditor, type Mode } from '../store/editor'
import { shapeToD } from '../geometry/shapes'
import { resolveFills } from '../store/fills'

export function FillsLayer({ doc }: { doc: DocState }) {
  const fills = resolveFills(doc)
  const preview = useEditor((s) => s.palettePreview)
  return (
    <g className="fills" data-testid="fills">
      {fills.map((f) => (
        <path key={f.fill.id} d={f.region.d} fill={preview?.id === f.fill.colorId ? preview.hex : f.hex} stroke={preview?.id === f.fill.colorId ? preview.hex : f.hex} className="fill" data-color-id={f.fill.colorId} data-area={Math.round(f.region.area)} />
      ))}
    </g>
  )
}

export function ShapesLayer({ doc, className = 'shapes' }: { doc: DocState; className?: string }) {
  const overrides = useEditor((s) => s.overrides)
  return (
    <g className={className} data-testid="shapes">
      {doc.shapes.map((s) => (
        <path key={s.id} d={shapeToD(overrides?.[s.id] ?? s)} className="shape" data-shape-id={s.id} />
      ))}
    </g>
  )
}

function RefImageView({ im, opacity }: { im: RefImage; opacity: number }) {
  const url = useImageUrl(im.blobId)
  if (!url) return null
  return <image href={url} x={im.x} y={im.y} width={im.w} height={im.h} opacity={opacity} preserveAspectRatio="none" data-testid="ref-image" />
}

/** Images de référence (filigrane) : jamais exportées, visibles seulement en édition. */
export function ImagesLayer({ doc }: { doc: DocState }) {
  const preview = useEditor((s) => s.imagePreview)
  const drag = useEditor((s) => s.imageDrag)
  return (
    <g className="ref-images" style={{ pointerEvents: 'none' }}>
      {doc.images.filter((i) => i.visible).map((im) => {
        const shown = drag?.id === im.id ? drag : im
        return <RefImageView key={im.id} im={shown} opacity={preview?.id === im.id ? preview.opacity : im.opacity} />
      })}
    </g>
  )
}

export function DocLayers({ doc, mode }: { doc: DocState; mode: Mode }) {
  return (
    <g className="doc-layers">
      <FillsLayer doc={doc} />
      {mode === 'edit' && <ImagesLayer doc={doc} />}
      {mode === 'edit' && <ShapesLayer doc={doc} />}
    </g>
  )
}
