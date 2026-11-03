import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { db } from './db'
import type { RefImage, StoredImage } from '../model/types'

const urlCache = new Map<string, string>()

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(file)
  })
}

export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => rej(new Error('image illisible'))
    img.src = dataUrl
  })
}

export async function storeImage(dataUrl: string, size: { width: number; height: number }): Promise<StoredImage> {
  const rec: StoredImage = { id: nanoid(12), dataUrl, ...size }
  await db.images.put(rec)
  urlCache.set(rec.id, dataUrl)
  return rec
}

/** Place l'image centrée sur le mur, à 80 % de sa taille max, proportions conservées. */
export function placeImage(stored: StoredImage, wall: { w: number; h: number }, name: string): RefImage {
  const k = Math.min((wall.w * 0.8) / stored.width, (wall.h * 0.8) / stored.height)
  const w = stored.width * k
  const h = stored.height * k
  return { id: nanoid(10), blobId: stored.id, name, x: (wall.w - w) / 2, y: (wall.h - h) / 2, w, h, opacity: 0.5, locked: false, visible: true }
}

export function useImageUrl(blobId: string): string | null {
  const [url, setUrl] = useState(() => urlCache.get(blobId) ?? null)
  useEffect(() => {
    if (urlCache.has(blobId)) {
      setUrl(urlCache.get(blobId)!)
      return
    }
    let alive = true
    db.images.get(blobId).then((r) => {
      if (!r || !alive) return
      urlCache.set(blobId, r.dataUrl)
      setUrl(r.dataUrl)
    })
    return () => {
      alive = false
    }
  }, [blobId])
  return url
}

/**
 * Redimensionne en gardant les proportions, en ancrant le coin opposé à la poignée.
 * corner : 0 = haut-gauche, 1 = haut-droit, 2 = bas-droit, 3 = bas-gauche.
 */
export function resizeKeepRatio(img: Pick<RefImage, 'x' | 'y' | 'w' | 'h'>, corner: number, p: { x: number; y: number }, minW = 5) {
  const ratio = img.h / img.w
  const ax = corner === 0 || corner === 3 ? img.x + img.w : img.x
  const ay = corner === 0 || corner === 1 ? img.y + img.h : img.y
  const dx = Math.abs(p.x - ax)
  const dy = Math.abs(p.y - ay)
  // la plus grande des deux projections pilote la taille
  const w = Math.max(minW, Math.max(dx, dy / ratio))
  const h = w * ratio
  const x = corner === 0 || corner === 3 ? ax - w : ax
  const y = corner === 0 || corner === 1 ? ay - h : ay
  return { x, y, w, h }
}
