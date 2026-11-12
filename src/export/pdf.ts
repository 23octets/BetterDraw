import { legal } from '../config/legal'
import type { WallContext } from '../geometry/paintable'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type { DocState } from '../model/types'
import { exportPages, PAGE, drawingSvg, type ExportMeta } from './svg'

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const safeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'dessin'

function parseSvg(svg: string): SVGSVGElement {
  const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement as unknown as SVGSVGElement
  // svg2pdf a besoin que l'élément soit dans le DOM pour certains calculs de style
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden'
  host.appendChild(el)
  document.body.appendChild(host)
  return el
}

export async function buildPdf(doc: DocState, meta: ExportMeta, room?: WallContext | null): Promise<Blob> {
  const pages = exportPages(doc, meta, room)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  pdf.setProperties({ title: `${meta.project} — ${meta.variant}`, creator: legal.productName })
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage('a4', 'landscape')
    const el = parseSvg(pages[i])
    try {
      await svg2pdf(el, pdf, { x: 0, y: 0, width: PAGE.w, height: PAGE.h })
    } finally {
      el.parentElement?.remove()
    }
  }
  return pdf.output('blob')
}

export async function exportPdf(doc: DocState, meta: ExportMeta, room?: WallContext | null) {
  const blob = await buildPdf(doc, meta, room)
  download(blob, `${safeName(meta.project)}-${safeName(meta.variant)}-chantier.pdf`)
  return blob
}

export function exportSvg(doc: DocState, meta: ExportMeta, room?: WallContext | null) {
  const svg = drawingSvg(doc, { room })
  download(new Blob([svg], { type: 'image/svg+xml' }), `${safeName(meta.project)}-${safeName(meta.variant)}.svg`)
}

export async function exportPng(doc: DocState, meta: ExportMeta, widthPx = 3508, room?: WallContext | null) {
  const svg = drawingSvg(doc, { room })
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('rendu PNG impossible'))
    img.src = url
  })
  const heightPx = Math.round((widthPx * 210) / 297)
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.drawImage(img, 0, 0, widthPx, heightPx)
  URL.revokeObjectURL(url)
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
  download(blob, `${safeName(meta.project)}-${safeName(meta.variant)}.png`)
  return blob
}
