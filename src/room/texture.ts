import type { DocState } from '../model/types'
import { drawingSvg } from '../export/svg'

/** Rend le dessin d'un mur (aplats, sans grille) dans un canvas, pour servir de texture. */
export async function paintCanvas(doc: DocState, opts: { lines?: boolean; maxSize?: number } = {}): Promise<HTMLCanvasElement> {
  const max = opts.maxSize ?? 2048
  const k = Math.min(6, max / Math.max(doc.wall.w, doc.wall.h))
  const w = Math.max(2, Math.round(doc.wall.w * k))
  const h = Math.max(2, Math.round(doc.wall.h * k))
  const svg = drawingSvg(doc, { grid: false, labels: false, lines: opts.lines ?? false })
  const sized = svg.replace(/width="[^"]*cm" height="[^"]*cm"/, `width="${w}" height="${h}"`)
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = doc.background.hex
  ctx.fillRect(0, 0, w, h)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    ctx.drawImage(img, 0, 0, w, h)
  } catch (e) {
    console.warn('[frsque] texture du mur', e)
  } finally {
    URL.revokeObjectURL(url)
  }
  return canvas
}

/** Parquet procédural pour le sol. */
export function floorCanvas(hex: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, 512, 512)
  const rows = 8
  const rh = 512 / rows
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 300
    while (x < 512) {
      const len = 220 + rnd() * 200
      const shade = (rnd() - 0.5) * 0.16
      ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`
      ctx.fillRect(x, r * rh, len, rh)
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(x, r * rh, 1.5, rh)
      x += len
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, r * rh, 512, 1.5)
    // veinage
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'
    for (let v = 0; v < 6; v++) {
      const y = r * rh + rnd() * rh
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(170, y + (rnd() - 0.5) * 8, 340, y + (rnd() - 0.5) * 8, 512, y)
      ctx.stroke()
    }
  }
  return c
}
