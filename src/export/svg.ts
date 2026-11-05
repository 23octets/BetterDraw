import type { WallContext } from '../geometry/paintable'
import { openingRect, windowBars } from '../room/geometry'
import type { DocState } from '../model/types'
import { shapeToD } from '../geometry/shapes'
import { dashPattern, gridLayout, gridStrokeFor, type GridCell } from '../geometry/grid'
import { resolveFills, surfaces } from '../store/fills'

/** Pages A4 paysage, en millimètres. */
export const PAGE = { w: 297, h: 210 }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (x: number) => +x.toFixed(3)
const fmt = (x: number) => {
  const r = Math.round(x * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}
/** N'accepte qu'une couleur hexadécimale (protège le SVG généré contre une injection). */
export const safeHex = (h: unknown) => (typeof h === 'string' && /^#[0-9a-f]{3,8}$/i.test(h) ? h : '#999999')
const FONT = 'Helvetica, Arial, sans-serif'
const ORIGIN_LABEL = { bl: 'bas-gauche', tl: 'haut-gauche', br: 'bas-droit', tr: 'haut-droit' } as const

export interface ExportMeta {
  project: string
  variant: string
  date?: string
}

/** Contenu du mur (fond, aplats, traits) en coordonnées cm, épaisseurs exprimées en unités du conteneur. */
function wallContent(doc: DocState, strokeCm: number, opts: { lines?: boolean } = {}) {
  const fills = resolveFills(doc)
  let s = `<rect x="0" y="0" width="${n(doc.wall.w)}" height="${n(doc.wall.h)}" fill="${safeHex(doc.background.hex)}"/>`
  for (const f of fills) s += `<path d="${esc(f.region.d)}" fill="${safeHex(f.hex)}" stroke="${safeHex(f.hex)}" stroke-width="${n(strokeCm * 0.4)}" stroke-linejoin="round"/>`
  if (opts.lines !== false)
    for (const sh of doc.shapes)
      s += `<path d="${esc(shapeToD(sh))}" fill="none" stroke="#1d1f22" stroke-width="${n(strokeCm)}" stroke-linejoin="round" stroke-linecap="round"/>`
  return s
}

function roomOverlay(doc: DocState, room: WallContext | null | undefined, stroke: number) {
  if (!room) return ''
  let s = '<g data-room-overlay="true">'
  const rects = [...(room.masks ?? []).map((r) => ({ r, label: 'Pas de mur', offset: 40, divisor: 5 })), ...room.openings.map((o) => ({ r: openingRect(o, doc.wall.h), label: o.kind === 'door' ? 'Porte' : 'Fenêtre', offset: 30, divisor: 6 }))]
  for (const { r, label, offset, divisor } of rects) {
    s += `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="#f3f1eb" stroke="#666666" stroke-width="${n(stroke)}"/>`
    // Hachures explicites : même rendu dans SVG, PNG et svg2pdf.
    for (let t = 8; t < r.w + r.h; t += 8) {
      const x1 = Math.max(0, t - r.h), y1 = Math.min(t, r.h)
      const x2 = Math.min(t, r.w), y2 = Math.max(0, t - r.w)
      s += `<line x1="${n(r.x + x1)}" y1="${n(r.y + y1)}" x2="${n(r.x + x2)}" y2="${n(r.y + y2)}" stroke="#cccccc" stroke-width="${n(stroke * 0.5)}"/>`
    }
    s += `<text x="${n(r.x + r.w / 2)}" y="${n(r.y + Math.min(r.h / 2, offset))}" text-anchor="middle" font-family="${FONT}" font-size="${n(Math.min(stroke * 10, Math.max(6, Math.min(14, r.w / divisor))))}" fill="#444444">${label}</text>`
  }
  for (const o of room.openings) for (const [x1, y1, x2, y2] of windowBars(o, doc.wall.h)) s += `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#666666" stroke-width="${n(stroke)}"/>`
  for (const seam of room.seams ?? []) if (seam.x > 0) s += `<line x1="${n(seam.x)}" y1="0" x2="${n(seam.x)}" y2="${n(doc.wall.h)}" stroke="#666666" stroke-dasharray="4 3" stroke-width="${n(stroke)}"/>`
  return s + '</g>'
}

let clipSeq = 0
/** Grille dont la couleur s'adapte à chaque aplat (lignes redessinées dans chaque zone peinte). */
function gridLines(doc: DocState, strokeCm0: number, _color?: string, dash = true) {
  const L = gridLayout(doc.wall, doc.grid)
  const strokeCm = strokeCm0 * (doc.grid.lineWidth ?? 1)
  const op = doc.grid.lineOpacity ?? 1
  const pat = dash ? dashPattern(doc.grid.lineStyle) : null
  const da = pat ? ` stroke-dasharray="${pat.map((x) => n(x * strokeCm)).join(' ')}" stroke-linecap="round"` : ''
  let lines = ''
  for (const l of L.vLines) lines += `<line x1="${n(l.pos)}" y1="0" x2="${n(l.pos)}" y2="${n(doc.wall.h)}"/>`
  for (const l of L.hLines) lines += `<line x1="0" y1="${n(l.pos)}" x2="${n(doc.wall.w)}" y2="${n(l.pos)}"/>`
  let s = `<g opacity="${n(op)}"><g stroke="${gridStrokeFor(safeHex(doc.background.hex))}" stroke-width="${n(strokeCm)}" fill="none"${da}>${lines}</g>`
  for (const f of resolveFills(doc)) {
    const id = `gc${++clipSeq}`
    s += `<defs><clipPath id="${id}"><path d="${esc(f.region.d)}"/></clipPath></defs>`
    s += `<g clip-path="url(#${id})"><g stroke="${safeHex(f.hex)}" stroke-width="${n(strokeCm * 1.2)}" fill="none">${lines}</g>`
    s += `<g stroke="${gridStrokeFor(safeHex(f.hex))}" stroke-width="${n(strokeCm)}" fill="none"${da}>${lines}</g></g>`
  }
  return s + '</g>'
}

/** Mur complet avec grille, repères et cotes, placé dans le rectangle (x, y, w, h) en mm. */
function wallBlock(doc: DocState, x: number, y: number, w: number, h: number, opts: { lines?: boolean; highlight?: string[]; fontMm?: number; room?: WallContext | null } = {}) {
  const fs = opts.fontMm ?? 3
  const ml = fs * 3.2, mt = fs * 2.6, mr = fs * 3.6, mb = fs * 3
  const k = Math.min((w - ml - mr) / doc.wall.w, (h - mt - mb) / doc.wall.h)
  const ww = doc.wall.w * k
  const wh = doc.wall.h * k
  const x0 = x + ml + (w - ml - mr - ww) / 2
  const y0 = y + mt + (h - mt - mb - wh) / 2
  const L = gridLayout(doc.wall, doc.grid)
  let s = `<g transform="translate(${n(x0)} ${n(y0)}) scale(${n(k)})">`
  s += wallContent(doc, 0.25 / k, opts)
  s += roomOverlay(doc, opts.room, 0.3 / k)
  if (doc.grid.show) s += gridLines(doc, 0.22 / k)
  for (const id of opts.highlight ?? []) {
    const c = L.cells.find((c) => c.id === id)
    if (c) s += `<rect x="${n(c.x)}" y="${n(c.y)}" width="${n(c.w)}" height="${n(c.h)}" fill="#2a6bd1" fill-opacity="0.12" stroke="#2a6bd1" stroke-width="${n(0.5 / k)}"/>`
  }
  s += `<rect x="0" y="0" width="${n(doc.wall.w)}" height="${n(doc.wall.h)}" fill="none" stroke="#1d1f22" stroke-width="${n(0.35 / k)}"/>`
  s += '</g>'
  if (doc.grid.show) {
    s += `<g font-family="${FONT}" font-size="${n(fs)}" fill="#9c4825" font-weight="bold">`
    for (const c of L.cells.filter((c) => c.row === 0)) s += `<text x="${n(x0 + (c.x + c.w / 2) * k)}" y="${n(y0 - fs * 0.8)}" text-anchor="middle">${c.id.replace(/\d+$/, '')}</text>`
    for (const c of L.cells.filter((c) => c.col === 0)) s += `<text x="${n(x0 - fs * 0.8)}" y="${n(y0 + (c.y + c.h / 2) * k + fs * 0.35)}" text-anchor="end">${c.row + 1}</text>`
    s += '</g>'
    s += `<g font-family="${FONT}" font-size="${n(fs * 0.8)}" fill="#4a4d52">`
    for (const l of L.vLines) s += `<line x1="${n(x0 + l.pos * k)}" y1="${n(y0 + wh + 0.6)}" x2="${n(x0 + l.pos * k)}" y2="${n(y0 + wh + 1.8)}" stroke="#4a4d52" stroke-width="0.2"/><text x="${n(x0 + l.pos * k)}" y="${n(y0 + wh + fs * 1.6)}" text-anchor="middle">${fmt(l.cote)}</text>`
    for (const l of L.hLines) s += `<line x1="${n(x0 + ww + 0.6)}" y1="${n(y0 + l.pos * k)}" x2="${n(x0 + ww + 1.8)}" y2="${n(y0 + l.pos * k)}" stroke="#4a4d52" stroke-width="0.2"/><text x="${n(x0 + ww + 2.4)}" y="${n(y0 + l.pos * k + fs * 0.3)}">${fmt(l.cote)}</text>`
    s += '</g>'
  }
  return { svg: s, k, x0, y0 }
}

function header(title: string, subtitle: string) {
  return (
    `<text x="12" y="15" font-family="${FONT}" font-size="7" font-weight="bold" fill="#1d1f22">${esc(title)}</text>` +
    `<text x="12" y="21.5" font-family="${FONT}" font-size="3.6" fill="#4a4d52">${esc(subtitle)}</text>` +
    `<line x1="12" y1="24.5" x2="285" y2="24.5" stroke="#d9d3c7" stroke-width="0.3"/>`
  )
}

function wrap(body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}"><rect width="${PAGE.w}" height="${PAGE.h}" fill="#ffffff"/>${body}</svg>`
}

export function coverPageSvg(doc: DocState, meta: ExportMeta, room?: WallContext | null): string {
  const S = surfaces(doc, room)
  const g = doc.grid
  const L = gridLayout(doc.wall, g)
  let body = header(`${meta.project} — ${meta.variant}`, `Mur ${fmt(doc.wall.w)} × ${fmt(doc.wall.h)} cm · grille ${fmt(g.step)} cm (${L.cols} × ${L.rows} cases) · cotes depuis le coin ${ORIGIN_LABEL[g.origin]}${meta.date ? ` · ${meta.date}` : ''}`)
  const block = wallBlock(doc, 10, 28, 200, 172, { highlight: doc.printCells, room })
  body += block.svg
  // légende
  let y = 34
  const lx = 216
  body += `<text x="${lx}" y="${y}" font-family="${FONT}" font-size="4" font-weight="bold" fill="#1d1f22">Couleurs</text>`
  y += 7
  const rows = [...S.colors.map((c) => ({ hex: c.hex, name: c.name, area: c.area, liters: c.liters, on: true }))]
  rows.push({ hex: doc.background.hex, name: 'Non peint', area: S.background.area, liters: 0, on: false })
  for (const r of rows) {
    body += `<rect x="${lx}" y="${y - 3.2}" width="4" height="4" fill="${safeHex(r.hex)}" stroke="#999" stroke-width="0.2"/>`
    body += `<text x="${lx + 6}" y="${y}" font-family="${FONT}" font-size="3.2" fill="${r.on ? '#1d1f22' : '#8a8780'}">${esc(r.name)}</text>`
    body += `<text x="${lx + 50}" y="${y}" font-family="${FONT}" font-size="3.2" fill="#1d1f22" text-anchor="end">${(r.area / 10000).toFixed(2)} m²</text>`
    if (doc.paint.showLiters) body += `<text x="${lx + 69}" y="${y}" font-family="${FONT}" font-size="3.2" fill="#1d1f22" text-anchor="end">${r.on ? `${r.liters.toFixed(2)} L` : '—'}</text>`
    y += 6.5
  }
  const totalA = S.colors.reduce((a, c) => a + c.area, 0)
  const totalL = S.colors.reduce((a, c) => a + c.liters, 0)
  body += `<line x1="${lx}" y1="${y - 3.5}" x2="${lx + 69}" y2="${y - 3.5}" stroke="#1d1f22" stroke-width="0.25"/>`
  body += `<text x="${lx}" y="${y + 1}" font-family="${FONT}" font-size="3.2" font-weight="bold">Total</text>`
  body += `<text x="${lx + 50}" y="${y + 1}" font-family="${FONT}" font-size="3.2" font-weight="bold" text-anchor="end">${(totalA / 10000).toFixed(2)} m²</text>`
  if (doc.paint.showLiters) body += `<text x="${lx + 69}" y="${y + 1}" font-family="${FONT}" font-size="3.2" font-weight="bold" text-anchor="end">${totalL.toFixed(2)} L</text>`
  y += 10
  const notes = [
    room && (room.openings.length || room.masks?.length) ? 'Ouvertures et zones sans mur déduites' : '',
    doc.paint.showLiters ? `Litres : ${doc.paint.coats} couche(s), rendement ${fmt(doc.paint.coverage)} m²/L` : '',
    `Échelle : 1 mm sur la page = ${fmt(1 / block.k)} cm au mur`,
    doc.printCells.length ? `Cases détaillées : ${doc.printCells.join(', ')}` : 'Aucune case détaillée',
  ].filter(Boolean)
  for (const t of notes) {
    body += `<text x="${lx}" y="${y}" font-family="${FONT}" font-size="2.8" fill="#4a4d52">${esc(t)}</text>`
    y += 5
  }
  return wrap(body)
}

export function cellPageSvg(doc: DocState, cell: GridCell, meta: ExportMeta, room?: WallContext | null): string {
  const g = doc.grid
  const L = gridLayout(doc.wall, g)
  const v = L.vLines.filter((l) => Math.abs(l.pos - cell.x) < 1e-6 || Math.abs(l.pos - (cell.x + cell.w)) < 1e-6).map((l) => l.cote).sort((a, b) => a - b)
  const h = L.hLines.filter((l) => Math.abs(l.pos - cell.y) < 1e-6 || Math.abs(l.pos - (cell.y + cell.h)) < 1e-6).map((l) => l.cote).sort((a, b) => a - b)
  let body = header(`Case ${cell.id}`, `${meta.project} — ${meta.variant} · horizontal de ${fmt(v[0])} à ${fmt(v[1])} cm · vertical de ${fmt(h[0])} à ${fmt(h[1])} cm (depuis le coin ${ORIGIN_LABEL[g.origin]})`)
  // zone principale : la case + 12 % de contexte autour
  const area = { x: 22, y: 34, w: 200, h: 160 }
  const pad = Math.max(cell.w, cell.h) * 0.12
  const vx = cell.x - pad, vy = cell.y - pad, vw = cell.w + 2 * pad, vh = cell.h + 2 * pad
  const k = Math.min(area.w / vw, area.h / vh)
  const ox = area.x + (area.w - vw * k) / 2 - vx * k
  const oy = area.y + (area.h - vh * k) / 2 - vy * k
  const clipId = `clip-${cell.id.replace(/[^A-Z0-9]/g, '')}`
  body += `<defs><clipPath id="${clipId}"><rect x="${n(area.x + (area.w - vw * k) / 2)}" y="${n(area.y + (area.h - vh * k) / 2)}" width="${n(vw * k)}" height="${n(vh * k)}"/></clipPath></defs>`
  body += `<g clip-path="url(#${clipId})"><g transform="translate(${n(ox)} ${n(oy)}) scale(${n(k)})">`
  body += wallContent(doc, 0.35 / k)
  body += roomOverlay(doc, room, 0.35 / k)
  if (g.show) body += gridLines(doc, 0.3 / k, '#c8643b', false)
  // voile sur le contexte hors case
  body += `<path d="M${n(vx)} ${n(vy)}h${n(vw)}v${n(vh)}h${n(-vw)}Z M${n(cell.x)} ${n(cell.y)}v${n(cell.h)}h${n(cell.w)}v${n(-cell.h)}Z" fill="#ffffff" fill-opacity="0.6" fill-rule="evenodd"/>`
  body += `<rect x="${n(cell.x)}" y="${n(cell.y)}" width="${n(cell.w)}" height="${n(cell.h)}" fill="none" stroke="#c8643b" stroke-width="${n(0.8 / k)}"/>`
  body += '</g></g>'
  // cotes de la grille sur les bords de la case
  const cx0 = ox + cell.x * k, cx1 = ox + (cell.x + cell.w) * k
  const cy0 = oy + cell.y * k, cy1 = oy + (cell.y + cell.h) * k
  const vxPos = L.vLines.filter((l) => Math.abs(l.pos - cell.x) < 1e-6 || Math.abs(l.pos - (cell.x + cell.w)) < 1e-6)
  const hyPos = L.hLines.filter((l) => Math.abs(l.pos - cell.y) < 1e-6 || Math.abs(l.pos - (cell.y + cell.h)) < 1e-6)
  body += `<g font-family="${FONT}" font-size="4" fill="#9c4825" font-weight="bold">`
  // cotes horizontales : décalées vers l'intérieur de la case ; verticales : décalées vers l'intérieur aussi,
  // pour ne pas se chevaucher aux coins
  for (const l of vxPos) {
    const x = ox + l.pos * k
    const left = Math.abs(x - cx0) < 1e-6
    const a = left ? 'start' : 'end'
    const dx = left ? 1.5 : -1.5
    body += `<text x="${n(x + dx)}" y="${n(cy0 - 2.5)}" text-anchor="${a}">${fmt(l.cote)} cm</text><text x="${n(x + dx)}" y="${n(cy1 + 6)}" text-anchor="${a}">${fmt(l.cote)} cm</text>`
  }
  for (const l of hyPos) {
    const y = oy + l.pos * k
    const top = Math.abs(y - cy0) < 1e-6
    const dy = top ? 5.5 : -2
    body += `<text x="${n(cx0 - 2.5)}" y="${n(y + dy)}" text-anchor="end">${fmt(l.cote)} cm</text><text x="${n(cx1 + 2.5)}" y="${n(y + dy)}">${fmt(l.cote)} cm</text>`
  }
  // tirets de repère sur les bords pour relier les cotes à leur ligne
  body += `<g stroke="#9c4825" stroke-width="0.3">`
  for (const l of vxPos) body += `<line x1="${n(ox + l.pos * k)}" y1="${n(cy0 - 2)}" x2="${n(ox + l.pos * k)}" y2="${n(cy0)}"/><line x1="${n(ox + l.pos * k)}" y1="${n(cy1)}" x2="${n(ox + l.pos * k)}" y2="${n(cy1 + 2)}"/>`
  for (const l of hyPos) body += `<line x1="${n(cx0 - 2)}" y1="${n(oy + l.pos * k)}" x2="${n(cx0)}" y2="${n(oy + l.pos * k)}"/><line x1="${n(cx1)}" y1="${n(oy + l.pos * k)}" x2="${n(cx1 + 2)}" y2="${n(oy + l.pos * k)}"/>`
  body += '</g>'
  body += '</g>'
  body += `<text x="${n((cx0 + cx1) / 2)}" y="${n((cy0 + cy1) / 2)}" font-family="${FONT}" font-size="${n(Math.min(30, (cx1 - cx0) / 3))}" fill="#c8643b" fill-opacity="0.12" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${cell.id}</text>`
  // mini-carte
  const mini = wallBlock(doc, 232, 120, 56, 50, { lines: false, highlight: [cell.id], fontMm: 2, room })
  body += `<text x="236" y="118" font-family="${FONT}" font-size="3" fill="#4a4d52">Position sur le mur</text>` + mini.svg
  body += `<text x="236" y="40" font-family="${FONT}" font-size="3" fill="#4a4d52">Case ${esc(cell.id)} : ${fmt(cell.w)} × ${fmt(cell.h)} cm</text>`
  body += `<text x="236" y="46" font-family="${FONT}" font-size="2.8" fill="#4a4d52">Reporter le dessin à l’œil,</text><text x="236" y="50.5" font-family="${FONT}" font-size="2.8" fill="#4a4d52">case par case.</text><text x="236" y="58" font-family="${FONT}" font-size="2.8" fill="#4a4d52">Référence agrandie,</text><text x="236" y="62.5" font-family="${FONT}" font-size="2.8" fill="#4a4d52">pas un patron 1:1.</text>`
  return wrap(body)
}

/** SVG du mur seul (export SVG / PNG), dimensions en cm. */
export function drawingSvg(doc: DocState, opts: { grid?: boolean; lines?: boolean; labels?: boolean; room?: WallContext | null } = {}): string {
  const showGrid = opts.grid ?? true
  if (opts.labels === false) {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(doc.wall.w)}cm" height="${n(doc.wall.h)}cm" viewBox="0 0 ${n(doc.wall.w)} ${n(doc.wall.h)}">`
    s += wallContent(doc, 0.4, { lines: opts.lines })
    s += roomOverlay(doc, opts.room, 0.4)
    if (showGrid && doc.grid.show) s += gridLines(doc, 0.3)
    return s + '</svg>'
  }
  const W = 297, H = 210
  const block = wallBlock({ ...doc, grid: { ...doc.grid, show: showGrid && doc.grid.show } }, 4, 4, W - 8, H - 8, { lines: opts.lines, room: opts.room })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${block.svg}</svg>`
}

export function exportPages(doc: DocState, meta: ExportMeta, room?: WallContext | null): string[] {
  const L = gridLayout(doc.wall, doc.grid)
  const cells = doc.printCells.map((id) => L.cells.find((c) => c.id === id)).filter((c): c is GridCell => !!c)
  cells.sort((a, b) => a.row - b.row || a.col - b.col)
  return [coverPageSvg(doc, meta, room), ...cells.map((c) => cellPageSvg(doc, c, meta, room))]
}
