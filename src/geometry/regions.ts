import type { DocState, Shape, Vec } from '../model/types'
import { getPaper, toPaperPath } from './paperScope'

/**
 * Détection des régions fermées délimitées par les traits et les bords du mur.
 *
 * 1. Toutes les courbes (formes + rectangle du mur) sont découpées à leurs intersections.
 * 2. On construit un graphe planaire (sommets fusionnés avec tolérance) et on retire
 *    les arêtes pendantes (traits qui ne ferment rien).
 * 3. Parcours des faces (demi-arêtes, on tourne toujours au plus serré) : chaque cycle
 *    d'orientation positive est une face bornée.
 * 4. Une région = la plus petite face contenant le point, moins les faces imbriquées dedans (îlots).
 */

const EPS = 0.02 // cm : tolérance de fusion des sommets

interface Edge {
  a: number
  b: number
  /** Courbe cubique [p0, c1, c2, p3] en coordonnées absolues. */
  c: [Vec, Vec, Vec, Vec]
}

export interface Face {
  path: paper.Path
  area: number
  interior: Vec
  comp: number
}

export interface Hole {
  path: paper.Path
  comp: number
  sample: Vec
}

export interface RegionGraph {
  faces: Face[]
  /** Contours extérieurs des composantes (orientation négative). */
  holes: Hole[]
  /** Sommets de degré 1 avant élagage (extrémités libres). */
  danglingEnds: Vec[]
}

function bez(c: [Vec, Vec, Vec, Vec], t: number): Vec {
  const u = 1 - t
  return {
    x: u * u * u * c[0].x + 3 * u * u * t * c[1].x + 3 * u * t * t * c[2].x + t * t * t * c[3].x,
    y: u * u * u * c[0].y + 3 * u * u * t * c[1].y + 3 * u * t * t * c[2].y + t * t * t * c[3].y,
  }
}

function wallShape(wall: { w: number; h: number }): Shape {
  return {
    id: '__wall',
    pts: [{ x: 0, y: 0 }, { x: wall.w, y: 0 }, { x: wall.w, y: wall.h }, { x: 0, y: wall.h }],
    segs: [{ t: 'line' }, { t: 'line' }, { t: 'line' }, { t: 'line' }],
    closed: true,
  }
}

const graphCache = new WeakMap<Shape[], Map<string, RegionGraph>>()

export function buildRegions(shapes: Shape[], wall: { w: number; h: number }): RegionGraph {
  const key = `${wall.w}x${wall.h}`
  let m = graphCache.get(shapes)
  if (!m) graphCache.set(shapes, (m = new Map()))
  const hit = m.get(key)
  if (hit) return hit
  const g = computeRegions(shapes, wall)
  m.set(key, g)
  return g
}

function computeRegions(shapes: Shape[], wall: { w: number; h: number }): RegionGraph {
  const P = getPaper()
  const all = [...shapes.filter((s) => s.pts.length >= 2), wallShape(wall)]
  const paths = all.map(toPaperPath)

  // 1) paramètres de découpe par courbe (index de chemin, index de courbe) → liste de t
  const cuts = paths.map((p) => p.curves.map(() => [] as number[]))
  const addCut = (loc: paper.CurveLocation) => {
    const pi = paths.indexOf(loc.path as paper.Path)
    if (pi < 0) return
    cuts[pi][loc.curve.index].push(loc.time)
  }
  for (let i = 0; i < paths.length; i++) {
    for (const loc of paths[i].getIntersections()) {
      addCut(loc)
      if (loc.intersection) addCut(loc.intersection)
    }
    for (let j = i + 1; j < paths.length; j++) {
      for (const loc of paths[i].getIntersections(paths[j])) {
        addCut(loc)
        if (loc.intersection) addCut(loc.intersection)
      }
    }
  }
  // extrémités libres posées « presque » sur une autre courbe : jonction en T
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]
    if (p.closed) continue
    for (const end of [p.firstSegment.point, p.lastSegment.point]) {
      for (let j = 0; j < paths.length; j++) {
        if (j === i) continue
        const loc = paths[j].getNearestLocation(end)
        if (loc && loc.point.getDistance(end) < EPS * 5) cuts[j][loc.curve.index].push(loc.time)
      }
    }
  }

  // 2) arêtes
  const verts: Vec[] = []
  const vIndex = (p: Vec) => {
    for (let k = 0; k < verts.length; k++) {
      if (Math.abs(verts[k].x - p.x) < EPS && Math.abs(verts[k].y - p.y) < EPS) return k
    }
    verts.push({ x: p.x, y: p.y })
    return verts.length - 1
  }
  const edges: Edge[] = []
  const seen = new Set<string>()
  paths.forEach((path, pi) => {
    path.curves.forEach((curve, ci) => {
      const ts = [0, ...cuts[pi][ci].filter((t) => t > 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b), 1]
      const vals = curve.values as number[]
      for (let k = 0; k < ts.length - 1; k++) {
        const t0 = ts[k], t1 = ts[k + 1]
        if (t1 - t0 < 1e-7) continue
        const sub = subCurve(vals, t0, t1)
        const c: [Vec, Vec, Vec, Vec] = [
          { x: sub[0], y: sub[1] }, { x: sub[2], y: sub[3] }, { x: sub[4], y: sub[5] }, { x: sub[6], y: sub[7] },
        ]
        const a = vIndex(c[0])
        const b = vIndex(c[3])
        const midp = bez(c, 0.5)
        if (a === b && Math.hypot(midp.x - c[0].x, midp.y - c[0].y) < EPS) continue
        const key = [Math.min(a, b), Math.max(a, b), Math.round(midp.x * 20), Math.round(midp.y * 20)].join(':')
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({ a, b, c })
      }
    })
  })

  // 3) élagage des arêtes pendantes
  const degree = new Array(verts.length).fill(0)
  for (const e of edges) {
    degree[e.a]++
    degree[e.b]++
  }
  const danglingEnds = verts.filter((_, k) => degree[k] === 1)
  const alive = edges.map(() => true)
  let changed = true
  while (changed) {
    changed = false
    edges.forEach((e, k) => {
      if (alive[k] && e.a !== e.b && (degree[e.a] === 1 || degree[e.b] === 1)) {
        alive[k] = false
        degree[e.a]--
        degree[e.b]--
        changed = true
      }
    })
  }

  // composantes connexes (union-find)
  const parent = verts.map((_, k) => k)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  edges.forEach((e, k) => {
    if (alive[k]) parent[find(e.a)] = find(e.b)
  })

  // 4) demi-arêtes triées par angle autour de chaque sommet
  interface Half { edge: number; from: number; to: number; rev: boolean; angle: number; twin: number }
  const halves: Half[] = []
  edges.forEach((e, k) => {
    if (!alive[k]) return
    const h1 = halves.length
    halves.push({ edge: k, from: e.a, to: e.b, rev: false, angle: dirAngle(e.c, false), twin: h1 + 1 })
    halves.push({ edge: k, from: e.b, to: e.a, rev: true, angle: dirAngle(e.c, true), twin: h1 })
  })
  const out = new Map<number, number[]>()
  halves.forEach((h, k) => {
    if (!out.has(h.from)) out.set(h.from, [])
    out.get(h.from)!.push(k)
  })
  for (const list of out.values()) list.sort((x, y) => halves[x].angle - halves[y].angle)

  const used = new Array(halves.length).fill(false)
  const faces: Face[] = []
  const holes: Hole[] = []
  for (let start = 0; start < halves.length; start++) {
    if (used[start]) continue
    const cycle: number[] = []
    let h = start
    let guard = 0
    while (!used[h] && guard++ < 100000) {
      used[h] = true
      cycle.push(h)
      // à l'arrivée, on prend la demi-arête suivante dans l'ordre angulaire après la jumelle
      const list = out.get(halves[h].to)!
      const twin = halves[h].twin
      const idx = list.indexOf(twin)
      h = list[(idx - 1 + list.length) % list.length]
    }
    if (h !== start) continue
    const path = new P.Path({ insert: false })
    for (const hk of cycle) {
      const half = halves[hk]
      const c = edges[half.edge].c
      const [p0, c1, c2, p3] = half.rev ? [c[3], c[2], c[1], c[0]] : c
      if (path.segments.length === 0) path.moveTo(new P.Point(p0.x, p0.y))
      path.cubicCurveTo(new P.Point(c1.x, c1.y), new P.Point(c2.x, c2.y), new P.Point(p3.x, p3.y))
    }
    path.closePath()
    const area = path.area
    const comp = find(halves[start].from)
    // Les faces bornées ont une aire positive (repère y vers le bas, parcours défini ci-dessus).
    if (area > 1e-4) {
      const ip = path.interiorPoint
      faces.push({ path, area, interior: { x: ip.x, y: ip.y }, comp })
    } else if (area < -1e-4) {
      const v0 = verts[halves[start].from]
      holes.push({ path, comp, sample: { x: v0.x, y: v0.y } })
    }
  }
  return { faces, holes, danglingEnds }
}

function dirAngle(c: [Vec, Vec, Vec, Vec], rev: boolean): number {
  // direction de départ : vers un point proche sur la courbe (gère les tangentes communes)
  const t = rev ? 0.995 : 0.005
  const from = rev ? c[3] : c[0]
  let p = bez(c, t)
  if (Math.hypot(p.x - from.x, p.y - from.y) < 1e-9) p = bez(c, rev ? 0.5 : 0.5)
  return Math.atan2(p.y - from.y, p.x - from.x)
}

/** Sous-courbe [t0, t1] d'une cubique (valeurs paper : 8 nombres). */
function subCurve(v: number[], t0: number, t1: number): number[] {
  const split = (vals: number[], t: number): [number[], number[]] => {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = vals
    const lx = (a: number, b: number) => a + (b - a) * t
    const ax = lx(x0, x1), ay = lx(y0, y1)
    const bx = lx(x1, x2), by = lx(y1, y2)
    const cx = lx(x2, x3), cy = lx(y2, y3)
    const dx = lx(ax, bx), dy = lx(ay, by)
    const ex = lx(bx, cx), ey = lx(by, cy)
    const fx = lx(dx, ex), fy = lx(dy, ey)
    return [
      [x0, y0, ax, ay, dx, dy, fx, fy],
      [fx, fy, ex, ey, cx, cy, x3, y3],
    ]
  }
  let right = t0 > 0 ? split(v, t0)[1] : v
  const tt = t0 >= 1 ? 1 : (t1 - t0) / (1 - t0)
  if (tt < 1) right = split(right, tt)[0]
  return right
}

export interface Region {
  /** Chemin SVG de la région (avec trous éventuels). */
  d: string
  area: number
  item: paper.PathItem
  faceIndex: number
}

/** Région contenant le point p (null si hors mur ou sur un bord). */
export function regionAt(graph: RegionGraph, p: Vec): Region | null {
  const P = getPaper()
  const pt = new P.Point(p.x, p.y)
  let best = -1
  graph.faces.forEach((f, k) => {
    if (f.path.contains(pt) && (best < 0 || f.area < graph.faces[best].area)) best = k
  })
  if (best < 0) return null
  return faceRegion(graph, best)
}

const regionCache = new WeakMap<RegionGraph, Map<number, Region>>()

export function faceRegion(graph: RegionGraph, k: number): Region {
  let m = regionCache.get(graph)
  if (!m) regionCache.set(graph, (m = new Map()))
  const hit = m.get(k)
  if (hit) return hit
  const P = getPaper()
  const outer = graph.faces[k]
  // trous directs : contours de composantes posées dans cette face (et pas plus profond)
  const direct = graph.holes.filter((h) => {
    if (h.comp === outer.comp) return false
    const pt = new P.Point(h.sample.x, h.sample.y)
    if (!outer.path.contains(pt)) return false
    let smallest = -1
    graph.faces.forEach((f, j) => {
      if (f.comp === h.comp) return
      if (f.path.contains(pt) && (smallest < 0 || f.area < graph.faces[smallest].area)) smallest = j
    })
    return smallest === k
  })
  const item: paper.PathItem = direct.length
    ? new P.CompoundPath({ children: [outer.path.clone({ insert: false }), ...direct.map((h) => h.path.clone({ insert: false }))], insert: false, fillRule: 'nonzero' })
    : outer.path.clone({ insert: false })
  const area = outer.area + direct.reduce((a, h) => a + h.path.area, 0)
  const r: Region = { d: item.pathData, area, item, faceIndex: k }
  m.set(k, r)
  return r
}

/** Toutes les régions (une par face bornée), hors la face « mur entier » si elle est découpée. */
export function allRegions(graph: RegionGraph): Region[] {
  return graph.faces.map((_, k) => faceRegion(graph, k))
}

/**
 * Cherche des « trous » : extrémités libres à l'intérieur de la région et très proches
 * d'un autre trait — signe d'une zone mal fermée.
 */
export function findGaps(doc: DocState, region: Region, graph: RegionGraph, tol: number): Vec[] {
  const P = getPaper()
  const gaps: Vec[] = []
  const paths = [...doc.shapes.map(toPaperPath), toPaperPath(wallShape(doc.wall))]
  for (const end of graph.danglingEnds) {
    // un bout de trait hors du mur ne laisse aucun trou : le bord du mur ferme la zone
    if (end.x <= 0 || end.y <= 0 || end.x >= doc.wall.w || end.y >= doc.wall.h) continue
    const pt = new P.Point(end.x, end.y)
    // l'extrémité doit toucher la région (dedans ou sur son bord)
    const inside = region.item.contains(pt) || region.item.getNearestPoint(pt).getDistance(pt) < tol
    if (!inside) continue
    for (const path of paths) {
      const q = path.getNearestPoint(pt)
      const d = q.getDistance(pt)
      if (d > EPS * 2 && d < tol) {
        gaps.push({ x: (end.x + q.x) / 2, y: (end.y + q.y) / 2 })
        break
      }
    }
    // extrémités libres proches l'une de l'autre
    for (const other of graph.danglingEnds) {
      if (other === end) continue
      const d = Math.hypot(other.x - end.x, other.y - end.y)
      if (d > EPS && d < tol && !gaps.some((g) => Math.hypot(g.x - (end.x + other.x) / 2, g.y - (end.y + other.y) / 2) < 1e-6)) {
        gaps.push({ x: (end.x + other.x) / 2, y: (end.y + other.y) / 2 })
      }
    }
  }
  return gaps
}
