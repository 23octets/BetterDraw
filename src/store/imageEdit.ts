import type { ImageEdit, Rect, RefImage, StoredImage, Vec } from '../model/types'
import { invertH, planWarp, warpPixels, type WarpPlan } from '../geometry/homography'

export function imageCornersPx(size: { width: number; height: number }): Vec[] {
  return [{ x: 0, y: 0 }, { x: size.width, y: 0 }, { x: size.width, y: size.height }, { x: 0, y: size.height }]
}

/** Réglages implicites d'une image jamais retouchée. */
export function defaultEdit(img: RefImage, stored: StoredImage): ImageEdit {
  const full = { w: stored.width, h: stored.height }
  const r: Rect = { x: 0, y: 0, w: full.w, h: full.h }
  return { sourceBlobId: img.blobId, quad: imageCornersPx(stored), realSize: null, full, rect: r, crop: { ...r } }
}

export function isIdentityQuad(quad: Vec[], src: { width: number; height: number }): boolean {
  return imageCornersPx(src).every((c, i) => Math.abs(c.x - quad[i].x) < 0.5 && Math.abs(c.y - quad[i].y) < 0.5)
}

/** Plan de correction (ou plan neutre si les coins n'ont pas bougé et aucune dimension n'est imposée). */
export function planFor(src: { width: number; height: number }, quad: Vec[], realSize: { w: number; h: number } | null): WarpPlan | null {
  if (isIdentityQuad(quad, src) && !realSize) return null
  return planWarp({ w: src.width, h: src.height }, quad, { ratio: realSize ? realSize.w / realSize.h : undefined })
}

/**
 * Nouvelle position / taille de l'image sur le mur : le rectangle corrigé garde son centre et sa
 * largeur (ou prend ses dimensions réelles), et un recadrage ne fait pas bouger ce qui reste visible.
 */
export function placement(img: Pick<RefImage, 'x' | 'y' | 'w' | 'h'>, old: ImageEdit, next: Pick<ImageEdit, 'rect' | 'crop' | 'realSize'>): Rect {
  const k = img.w / old.crop.w
  const anchor = {
    x: img.x + (old.rect.x + old.rect.w / 2 - old.crop.x) * k,
    y: img.y + (old.rect.y + old.rect.h / 2 - old.crop.y) * k,
  }
  const k2 = next.realSize ? next.realSize.w / next.rect.w : (k * old.rect.w) / next.rect.w
  return {
    x: anchor.x - (next.rect.x + next.rect.w / 2 - next.crop.x) * k2,
    y: anchor.y - (next.rect.y + next.rect.h / 2 - next.crop.y) * k2,
    w: next.crop.w * k2,
    h: next.crop.h * k2,
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('image illisible'))
    im.src = url
  })
}

/** Image corrigée complète (canvas), sans recadrage. */
export async function renderCorrected(sourceUrl: string, plan: WarpPlan | null): Promise<HTMLCanvasElement> {
  const im = await loadImage(sourceUrl)
  const canvas = document.createElement('canvas')
  if (!plan) {
    canvas.width = im.naturalWidth
    canvas.height = im.naturalHeight
    canvas.getContext('2d')!.drawImage(im, 0, 0)
    return canvas
  }
  const src = document.createElement('canvas')
  src.width = im.naturalWidth
  src.height = im.naturalHeight
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(im, 0, 0)
  const data = sctx.getImageData(0, 0, src.width, src.height)
  const px = warpPixels({ data: data.data, width: src.width, height: src.height }, invertH(plan.H), { width: plan.full.w, height: plan.full.h })
  canvas.width = plan.full.w
  canvas.height = plan.full.h
  canvas.getContext('2d')!.putImageData(new ImageData(px as unknown as Uint8ClampedArray<ArrayBuffer>, plan.full.w, plan.full.h), 0, 0)
  return canvas
}

/** Recadre et encode (WebP avec transparence). */
export function cropToDataUrl(full: HTMLCanvasElement, crop: Rect): { dataUrl: string; width: number; height: number } {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(crop.w))
  c.height = Math.max(1, Math.round(crop.h))
  c.getContext('2d')!.drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height)
  return { dataUrl: c.toDataURL('image/webp', 0.92), width: c.width, height: c.height }
}

export function clampCrop(c: Rect, full: { w: number; h: number }, min = 8): Rect {
  const x = Math.max(0, Math.min(full.w - min, c.x))
  const y = Math.max(0, Math.min(full.h - min, c.y))
  return { x, y, w: Math.max(min, Math.min(full.w - x, c.w)), h: Math.max(min, Math.min(full.h - y, c.h)) }
}
