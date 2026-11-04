import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { DocState, Opening, RoomPlan, Vec } from '../model/types'
import { bounds, outerPts, wallSeg, windowBase, windowCols, windowRows, type WallSeg } from './geometry'
import { floorCanvas, paintCanvas } from './texture'
import { WalkControls, type Collider } from './walk'

/** Plan en cm → monde Three.js en mètres (y vers le haut, le y du plan devient z). */
const M = 0.01
const W = (p: Vec, h = 0) => new THREE.Vector3(p.x * M, h * M, p.y * M)

export type ViewMode = 'orbit' | 'walk'

export interface WallPaint {
  doc: DocState | null
  /** Clé de cache : change quand le dessin change. */
  key: string
  /** Mur d'un groupe de murs liés : sa bande dans le dessin commun (fractions de la largeur). */
  crop?: { x: number; w: number }
}

export interface SceneOptions {
  lines: boolean
  cutaway: boolean
}

/** Accumulateur de quadrilatères (positions, uv, indices). */
class Quads {
  pos: number[] = []
  uv: number[] = []
  idx: number[] = []
  /** p0..p3 dans l'ordre ; retourné si sa normale ne va pas dans le sens `want`. */
  add(p: THREE.Vector3[], uv: [number, number][], want: THREE.Vector3) {
    const e1 = p[1].clone().sub(p[0])
    const e2 = p[2].clone().sub(p[0])
    const flip = e1.cross(e2).dot(want) < 0
    const base = this.pos.length / 3
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i].x, p[i].y, p[i].z)
      this.uv.push(uv[i][0], uv[i][1])
    }
    if (flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    return g
  }
}

interface Hole {
  u0: number
  u1: number
  v0: number
  v1: number
}

/** Rectangles pleins de la face [u0,u1]×[0,H] privée des trous (découpage en colonnes). */
function solidRects(u0: number, u1: number, H: number, holes: Hole[]) {
  const cuts = new Set([u0, u1])
  for (const h of holes) {
    if (h.u0 > u0 && h.u0 < u1) cuts.add(h.u0)
    if (h.u1 > u0 && h.u1 < u1) cuts.add(h.u1)
  }
  const xs = [...cuts].sort((a, b) => a - b)
  const out: Hole[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1]
    if (b - a < 1e-6) continue
    const cover = holes.filter((h) => h.u0 <= a + 1e-6 && h.u1 >= b - 1e-6).sort((p, q) => p.v0 - q.v0)
    let v = 0
    for (const h of cover) {
      if (h.v0 > v + 1e-6) out.push({ u0: a, u1: b, v0: v, v1: h.v0 })
      v = Math.max(v, h.v1)
    }
    if (H > v + 1e-6) out.push({ u0: a, u1: b, v0: v, v1: H })
  }
  return out
}

/**
 * Géométrie d'un mur : face intérieure (texturée, uv = position dans le dessin)
 * et le reste (face extérieure, dessus, tableaux des ouvertures).
 */
export function buildWall(
  s: WallSeg, outerA: Vec, outerB: Vec, t: number, H: number, fullH: number, openings: Opening[],
  /** Muret prolongé jusque sous le mur voisin (bout du nu intérieur), quand le voisin est raccourci. */
  ext: { innerA?: Vec; innerB?: Vec } = {},
) {
  const up = new THREE.Vector3(0, 1, 0)
  const dir = new THREE.Vector3(s.dir.x, 0, s.dir.y)
  const n = new THREE.Vector3(s.n.x, 0, s.n.y)
  const P = (u: number, v: number, depth = 0) => W({ x: s.a.x + s.dir.x * u - s.n.x * depth, y: s.a.y + s.dir.y * u - s.n.y * depth }, v)
  const holes: Hole[] = openings
    .map((o) => ({ u0: o.x, u1: o.x + o.w, v0: o.sill, v1: Math.min(H, o.sill + o.h) }))
    .filter((h) => h.v0 < H - 1e-6 && h.u1 > h.u0)
  const inner = new Quads()
  for (const r of solidRects(0, s.len, H, holes)) {
    const uv = (u: number, v: number): [number, number] => [u / s.len, v / fullH]
    inner.add([P(r.u0, r.v0), P(r.u1, r.v0), P(r.u1, r.v1), P(r.u0, r.v1)], [uv(r.u0, r.v0), uv(r.u1, r.v0), uv(r.u1, r.v1), uv(r.u0, r.v1)], n)
  }
  const rest = new Quads()
  const proj = (p: Vec) => (p.x - s.a.x) * s.dir.x + (p.y - s.a.y) * s.dir.y
  const ua = proj(outerA), ub = proj(outerB)
  const z: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]]
  const outN = n.clone().negate()
  for (const r of solidRects(ua, ub, H, holes)) rest.add([P(r.u0, r.v0, t), P(r.u1, r.v0, t), P(r.u1, r.v1, t), P(r.u0, r.v1, t)], z, outN)
  // dessus du mur
  const ia = ext.innerA ?? s.a, ib = ext.innerB ?? s.b
  rest.add([W(ia, H), W(ib, H), W(outerB, H), W(outerA, H)], z, up)
  // dessous (fermé lui aussi, pour ne jamais voir l'intérieur du mur)
  rest.add([W(ia, 0), W(ib, 0), W(outerB, 0), W(outerA, 0)], z, up.clone().negate())
  // prolongements du nu intérieur sous le voisin raccourci
  if (ext.innerA) rest.add([W(ext.innerA, 0), W(s.a, 0), W(s.a, H), W(ext.innerA, H)], z, n)
  if (ext.innerB) rest.add([W(s.b, 0), W(ext.innerB, 0), W(ext.innerB, H), W(s.b, H)], z, n)
  // les deux bouts sont toujours fermés : un mur est un volume plein, on ne voit jamais son intérieur
  // (quand le voisin est là, le bout est caché dans l'angle)
  rest.add([W(ia, 0), W(outerA, 0), W(outerA, H), W(ia, H)], z, dir.clone().negate())
  rest.add([W(ib, 0), W(outerB, 0), W(outerB, H), W(ib, H)], z, dir)
  // tableaux (épaisseur visible dans les ouvertures)
  for (const h of holes) {
    rest.add([P(h.u0, h.v0), P(h.u0, h.v1), P(h.u0, h.v1, t), P(h.u0, h.v0, t)], z, dir)
    rest.add([P(h.u1, h.v0), P(h.u1, h.v1), P(h.u1, h.v1, t), P(h.u1, h.v0, t)], z, dir.clone().negate())
    if (h.v1 < H - 1e-6) rest.add([P(h.u0, h.v1), P(h.u1, h.v1), P(h.u1, h.v1, t), P(h.u0, h.v1, t)], z, up.clone().negate())
    if (h.v0 > 1e-6) rest.add([P(h.u0, h.v0), P(h.u1, h.v0), P(h.u1, h.v0, t), P(h.u0, h.v0, t)], z, up)
  }
  return { inner: inner.geometry(), rest: rest.geometry() }
}

const CUT_H = 12

/** Intersection des droites (p1, d1) et (p2, d2) ; null si parallèles. */
function intersect(p1: Vec, d1: Vec, p2: Vec, d2: Vec): Vec | null {
  const den = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(den) < 1e-6) return null
  const k = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
  return { x: p1.x + d1.x * k, y: p1.y + d1.y * k }
}

/**
 * Variantes d'un mur selon l'état de ses voisins (bit 1 : côté A, bit 2 : côté B).
 * Mur entier : raccourci au nu intérieur du voisin coupé (sa tranche ne dépasse pas au-dessus du muret).
 * Muret : prolongé jusqu'au nu extérieur du voisin entier (il remplit l'angle).
 */
interface WallObj {
  /** Indexé par les côtés dont le voisin est coupé. */
  fulls: THREE.Group[]
  /** Indexé par les côtés dont le voisin est entier. */
  stubs: THREE.Group[]
  fixtures: THREE.Group
  innerMat: THREE.MeshStandardMaterial
  seg: WallSeg
  key: string
}

export class RoomScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 300)
  private orbit: OrbitControls
  private walk: WalkControls
  private content = new THREE.Group()
  private walls: WallObj[] = []
  private ceiling: THREE.Mesh | null = null
  private textures = new Map<string, THREE.Texture>()
  private restMat = new THREE.MeshStandardMaterial({ color: 0xf1eee8, roughness: 0.95 })
  private sun: THREE.DirectionalLight
  private clock = new THREE.Clock()
  private ro: ResizeObserver
  private room: RoomPlan | null = null
  private opts: SceneOptions = { lines: false, cutaway: true }
  private selected: number | null = null
  private framed = false
  private disposed = false
  mode: ViewMode = 'orbit'
  onPick: (index: number | null, open: boolean) => void = () => {}
  onModeChange: (m: ViewMode) => void = () => {}
  onLockChange: (locked: boolean) => void = () => {}

  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.dataset.testid = 'room-3d-canvas'
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0xe9e5dc)
    this.scene.add(this.content)

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cdbb, 1.1))
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9))
    this.sun = new THREE.DirectionalLight(0xfff6e8, 1.3)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.02
    this.scene.add(this.sun, this.sun.target)

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xe2ddd2, roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    // assez bas pour ne jamais se confondre avec le parquet (précision du tampon de profondeur)
    ground.position.y = -0.03
    ground.receiveShadow = true
    this.scene.add(ground)

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.12
    this.orbit.maxPolarAngle = Math.PI * 0.49
    this.orbit.minDistance = 0.5
    this.orbit.maxDistance = 60

    this.walk = new WalkControls(this.camera, this.renderer.domElement)
    this.walk.onLockChange = (l) => this.onLockChange(l)

    this.bindPicking()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
    this.renderer.setAnimationLoop(() => this.tick())
  }

  private bindPicking() {
    const el = this.renderer.domElement
    let down: { x: number; y: number } | null = null
    const ray = new THREE.Raycaster()
    const hit = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera)
      const targets = this.walls.flatMap((w) => [...w.fulls, ...w.stubs].filter((g) => g.visible).flatMap((g) => g.children))
      const h = ray.intersectObjects(targets, false)[0]
      return h ? (h.object.userData.wall as number) : null
    }
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }))
    el.addEventListener('pointerup', (e) => {
      if (this.mode !== 'orbit' || !down) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) this.onPick(hit(e), false)
      down = null
    })
    el.addEventListener('dblclick', (e) => {
      if (this.mode !== 'orbit') return
      const i = hit(e)
      if (i !== null) this.onPick(i, true)
    })
  }

  setOptions(o: Partial<SceneOptions>) {
    const linesChanged = o.lines !== undefined && o.lines !== this.opts.lines
    this.opts = { ...this.opts, ...o }
    if (linesChanged && this.room) this.refreshTextures()
  }

  private lastPaints: WallPaint[] = []

  /** Reconstruit la pièce. Les textures sont produites en arrière-plan (et mises en cache). */
  setRoom(room: RoomPlan, paints: WallPaint[]) {
    this.room = room
    this.lastPaints = paints
    this.clearContent()
    const H = room.height
    const outer = outerPts(room)
    const k = room.pts.length

    // sol (sous les murs aussi) et plafond (visite)
    const floorTex = new THREE.CanvasTexture(floorCanvas(room.floor))
    floorTex.colorSpace = THREE.SRGBColorSpace
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
    floorTex.repeat.set(1 / 1.6, 1 / 1.6)
    floorTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const floor = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x * M, -p.y * M)))),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.content.add(floor)
    const ceil = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(room.pts.map((p) => new THREE.Vector2(p.x * M, p.y * M)))),
      new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 1 }),
    )
    ceil.rotation.x = Math.PI / 2
    ceil.position.y = H * M
    ceil.visible = this.mode === 'walk'
    this.ceiling = ceil
    this.content.add(ceil)

    for (let i = 0; i < k; i++) {
      const s = wallSeg(room, i)
      if (s.len < 0.5) continue
      const ops = room.walls[i]?.openings ?? []
      const paint = paints[i]
      const innerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 })
      if (paint?.doc) innerMat.color.set(paint.doc.background.hex)
      const t = room.thickness
      const prev = wallSeg(room, i - 1)
      const next = wallSeg(room, i + 1)
      const off = (q: WallSeg, d: number) => ({ x: q.a.x - q.n.x * d, y: q.a.y - q.n.y * d })
      // côté A : notre nu extérieur ∩ nu intérieur du mur précédent, et notre nu intérieur ∩ son nu extérieur
      const trimA = intersect(off(s, t), s.dir, prev.a, prev.dir)
      // (aux angles rentrants, le mur entier couvre l'angle : le muret n'a pas à être prolongé)
      const cross = (u: Vec, v: Vec) => u.x * v.y - u.y * v.x
      const extA = cross(prev.dir, s.dir) > 1e-6 ? intersect(s.a, s.dir, off(prev, t), prev.dir) : null
      const trimB = intersect(off(s, t), s.dir, next.a, next.dir)
      const extB = cross(s.dir, next.dir) > 1e-6 ? intersect(s.a, s.dir, off(next, t), next.dir) : null
      const make = (h: number, mode: 'full' | 'stub', bits: number) => {
        const g = new THREE.Group()
        const A = bits & 1, B = bits & 2
        const oa = mode === 'full' && A && trimA ? trimA : outer[i]
        const ob = mode === 'full' && B && trimB ? trimB : outer[(i + 1) % k]
        const ext = mode === 'stub' ? { innerA: A && extA ? extA : undefined, innerB: B && extB ? extB : undefined } : {}
        // le muret d'un mur coupé est continu : pas de découpe pour les portes (on ne voit pas dans le mur)
        const geo = buildWall(s, oa, ob, t, h, H, mode === 'stub' ? [] : ops, ext)
        const a = new THREE.Mesh(geo.inner, innerMat)
        const b = new THREE.Mesh(geo.rest, this.restMat)
        for (const m of [a, b]) {
          m.castShadow = true
          m.receiveShadow = true
          m.userData.wall = i
        }
        g.add(a, b)
        return g
      }
      const fulls = [0, 1, 2, 3].map((b) => make(H, 'full', b))
      const stubs = [0, 1, 2, 3].map((b) => make(CUT_H, 'stub', b))
      for (const g of [...fulls, ...stubs]) g.visible = false
      fulls[0].visible = true
      const fixtures = this.buildOpenings(s, room.thickness, ops)
      this.content.add(...fulls, ...stubs, fixtures)
      this.walls.push({ fulls, stubs, fixtures, innerMat, seg: s, key: paint?.key ?? '' })
    }
    this.applySelection()
    this.refreshTextures()
    this.walk.setColliders(this.colliders(room))
    this.placeSun(room)
    if (!this.framed) {
      this.frame()
      this.framed = true
    }
  }

  private pending = new Map<string, Promise<THREE.Texture | null>>()

  /** Texture d'un dessin (partagée par les murs d'un même groupe). */
  private baseTexture(key: string, doc: DocState): Promise<THREE.Texture | null> {
    const hit = this.textures.get(key)
    if (hit) return Promise.resolve(hit)
    let p = this.pending.get(key)
    if (!p) {
      p = paintCanvas(doc, { lines: this.opts.lines, maxSize: Math.min(8192, this.renderer.capabilities.maxTextureSize) }).then((canvas) => {
        this.pending.delete(key)
        if (this.disposed) return null
        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        this.textures.set(key, tex)
        return tex
      })
      this.pending.set(key, p)
    }
    return p
  }

  private async refreshTextures() {
    const used = new Set<string>()
    const jobs = this.walls.map(async (w, idx) => {
      const paint = this.lastPaints[w.seg.index]
      if (!paint?.doc) return
      const key = `${paint.key}|${this.opts.lines ? 1 : 0}`
      used.add(key)
      let tex = await this.baseTexture(key, paint.doc)
      if (!tex) return
      if (paint.crop) {
        // même image, une bande par mur
        const ck = `${key}|${paint.crop.x.toFixed(5)}:${paint.crop.w.toFixed(5)}`
        used.add(ck)
        let c = this.textures.get(ck)
        if (!c) {
          c = tex.clone()
          c.repeat.set(paint.crop.w, 1)
          c.offset.set(paint.crop.x, 0)
          c.needsUpdate = true
          this.textures.set(ck, c)
        }
        tex = c
      }
      const cur = this.walls[idx]
      if (cur !== w) return
      w.innerMat.map = tex
      w.innerMat.color.set(0xffffff)
      w.innerMat.needsUpdate = true
    })
    await Promise.all(jobs)
    // purge des textures qui ne servent plus
    for (const [k, t] of this.textures) if (!used.has(k)) {
      t.dispose()
      this.textures.delete(k)
    }
  }

  private buildOpenings(s: WallSeg, t: number, ops: Opening[]) {
    const g = new THREE.Group()
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.6 })
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.55 })
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfdcec, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false })
    const metal = new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.3, metalness: 0.8 })
    const angle = Math.atan2(s.dir.y, s.dir.x)
    /** Boîte dans le repère du mur : u le long du mur, v en hauteur, d vers l'intérieur (cm). */
    const box = (u0: number, u1: number, v0: number, v1: number, d0: number, d1: number, mat: THREE.Material, parent: THREE.Object3D = g) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry((u1 - u0) * M, (v1 - v0) * M, (d1 - d0) * M), mat)
      const u = (u0 + u1) / 2, v = (v0 + v1) / 2, d = (d0 + d1) / 2
      m.position.copy(W({ x: s.a.x + s.dir.x * u + s.n.x * d, y: s.a.y + s.dir.y * u + s.n.y * d }, v))
      m.rotation.y = -angle
      m.castShadow = true
      m.receiveShadow = true
      parent.add(m)
      return m
    }
    for (const o of ops) {
      const x0 = o.x, x1 = o.x + o.w, top = o.sill + o.h
      const fw = 6 // largeur du chambranle / dormant
      if (o.kind === 'door') {
        // chambranle côté intérieur
        box(x0 - fw, x0, 0, top + fw, 0, 1.2, frameMat)
        box(x1, x1 + fw, 0, top + fw, 0, 1.2, frameMat)
        box(x0 - fw, x1 + fw, top, top + fw, 0, 1.2, frameMat)
        // vantail entrouvert vers l'intérieur, charnière à gauche
        const leafW = o.w - 1.5
        const pivot = new THREE.Group()
        pivot.position.copy(W({ x: s.a.x + s.dir.x * (x0 + 0.5) + s.n.x * -1, y: s.a.y + s.dir.y * (x0 + 0.5) + s.n.y * -1 }, 0))
        pivot.rotation.y = -angle
        const leaf = new THREE.Group()
        leaf.rotation.y = -0.45 // ~26°, ouvre vers l'intérieur de la pièce
        pivot.add(leaf)
        const slab = new THREE.Mesh(new THREE.BoxGeometry(leafW * M, (o.h - 1) * M, 4 * M), doorMat)
        slab.position.set((leafW / 2) * M, ((o.h - 1) / 2) * M, 2 * M)
        slab.castShadow = slab.receiveShadow = true
        const knob = new THREE.Mesh(new THREE.BoxGeometry(12 * M, 2 * M, 2 * M), metal)
        knob.position.set((leafW - 9) * M, 105 * M, 5 * M)
        leaf.add(slab, knob)
        g.add(pivot)
      } else {
        // dormant au milieu de l'épaisseur, vitrage, tablette intérieure
        const dm = -t / 2
        box(x0, x0 + 5, o.sill, top, dm - 3, dm + 3, frameMat)
        box(x1 - 5, x1, o.sill, top, dm - 3, dm + 3, frameMat)
        box(x0, x1, top - 5, top, dm - 3, dm + 3, frameMat)
        box(x0, x1, o.sill, o.sill + 5, dm - 3, dm + 3, frameMat)
        const cols = windowCols(o), rows = windowRows(o), base = windowBase(o)
        const split = o.sill + base // haut du soubassement vitré
        // montants (sur toute la hauteur) et petits bois
        for (let c = 1; c < cols; c++) {
          const x = x0 + (o.w * c) / cols
          box(x - 2.5, x + 2.5, o.sill, top, dm - 2.5, dm + 2.5, frameMat)
        }
        const upper0 = base > 0 ? split : o.sill
        for (let l = 1; l < rows; l++) {
          const v = upper0 + ((top - upper0) * l) / rows
          box(x0, x1, v - 2, v + 2, dm - 2, dm + 2, frameMat)
        }
        // traverse entre le soubassement et la partie haute
        if (base > 0) box(x0, x1, split - 3, split + 3, dm - 3, dm + 3, frameMat)
        const glass = box(x0 + 5, x1 - 5, o.sill + 5, top - 5, dm - 0.4, dm + 0.4, glassMat)
        glass.castShadow = false
        if (o.sill > 5) box(x0 - 3, x1 + 3, o.sill - 3, o.sill, dm, 4, frameMat)
      }
    }
    return g
  }

  private colliders(room: RoomPlan): Collider[] {
    const out: Collider[] = []
    for (let i = 0; i < room.pts.length; i++) {
      const s = wallSeg(room, i)
      const t = room.thickness
      const doors = (room.walls[i]?.openings ?? []).filter((o) => o.kind === 'door').sort((a, b) => a.x - b.x)
      const seg = (u0: number, u1: number) => {
        if (u1 - u0 < 1) return
        const off = -t / 2
        out.push({
          a: { x: (s.a.x + s.dir.x * u0 + s.n.x * off) * M, y: (s.a.y + s.dir.y * u0 + s.n.y * off) * M },
          b: { x: (s.a.x + s.dir.x * u1 + s.n.x * off) * M, y: (s.a.y + s.dir.y * u1 + s.n.y * off) * M },
          half: (t / 2) * M,
        })
      }
      let c = -t
      for (const d of doors) {
        seg(c, d.x)
        c = Math.max(c, d.x + d.w)
      }
      seg(c, s.len + t)
    }
    return out
  }

  private placeSun(room: RoomPlan) {
    const b = bounds(room.pts)
    const cx = (b.x + b.w / 2) * M, cz = (b.y + b.h / 2) * M
    const r = Math.max(b.w, b.h) * M
    this.sun.position.set(cx - r * 0.8, r * 2 + 4, cz + r * 1.2)
    this.sun.target.position.set(cx, 0, cz)
    const sc = this.sun.shadow.camera
    sc.left = sc.bottom = -r * 1.5
    sc.right = sc.top = r * 1.5
    sc.near = 0.1
    sc.far = r * 6 + 20
    sc.updateProjectionMatrix()
  }

  /** Cadre la pièce (vue plongeante depuis le « bas » du plan). */
  frame() {
    if (!this.room) return
    const b = bounds(this.room.pts)
    const cx = (b.x + b.w / 2) * M, cz = (b.y + b.h / 2) * M
    const r = Math.max(b.w, b.h, this.room.height) * M
    this.orbit.target.set(cx, this.room.height * M * 0.35, cz)
    this.camera.position.set(cx + r * 0.35, r * 1.15 + this.room.height * M, cz + r * 1.35)
    this.orbit.update()
  }

  setMode(m: ViewMode) {
    if (m === this.mode) return
    this.mode = m
    if (this.ceiling) this.ceiling.visible = m === 'walk'
    this.orbit.enabled = m === 'orbit'
    if (m === 'walk' && this.room) {
      // départ : face au premier mur, adossé au mur d'en face
      const s = wallSeg(this.room, 0)
      const mid = { x: s.a.x + (s.dir.x * s.len) / 2, y: s.a.y + (s.dir.y * s.len) / 2 }
      let depth = Infinity
      for (let i = 1; i < this.room.pts.length; i++) {
        const o = wallSeg(this.room, i)
        // intersection du rayon mid + t·n avec le mur o
        const den = s.n.x * o.dir.y - s.n.y * o.dir.x
        if (Math.abs(den) < 1e-9) continue
        const dx = o.a.x - mid.x, dy = o.a.y - mid.y
        const t = (dx * o.dir.y - dy * o.dir.x) / den
        const u = (dx * s.n.y - dy * s.n.x) / den
        if (t > 1 && u >= -1 && u <= o.len + 1) depth = Math.min(depth, t)
      }
      const back = Number.isFinite(depth) ? Math.max(depth * 0.5, depth - 60) : 150
      this.camera.fov = 70
      this.camera.updateProjectionMatrix()
      this.walk.place((mid.x + s.n.x * back) * M, (mid.y + s.n.y * back) * M, Math.atan2(-s.n.y, -s.n.x))
      this.walk.enabled = true
    } else {
      this.walk.enabled = false
      this.walk.unlock()
      this.camera.fov = 50
      this.camera.updateProjectionMatrix()
      this.frame()
    }
    this.onModeChange(m)
  }

  lock() {
    this.walk.lock()
  }

  setSelected(i: number | null) {
    this.selected = i
    this.applySelection()
  }

  private applySelection() {
    for (const w of this.walls) {
      const on = w.seg.index === this.selected
      w.innerMat.emissive.set(on ? 0x5a3fe0 : 0x000000)
      w.innerMat.emissiveIntensity = on ? 0.18 : 0
    }
  }

  /**
   * Murs à couper pour voir dans la pièce : ceux dont la caméra voit l'extérieur, et ceux qui sont
   * nettement plus près de la caméra que le centre de la pièce (ex. le petit mur d'un décroché tourné vers elle).
   */
  private cutWalls(c: Vec) {
    const room = this.room
    if (!room) return this.walls.map(() => false)
    const b = bounds(room.pts)
    const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    const fx = center.x - c.x, fy = center.y - c.y
    const fl = Math.hypot(fx, fy) || 1
    const f = { x: fx / fl, y: fy / fl }
    const margin = 0.15 * Math.max(b.w, b.h)
    return this.walls.map((w) => {
      const s = w.seg
      if ((c.x - s.a.x) * s.n.x + (c.y - s.a.y) * s.n.y < 0) return true
      // profondeur du point du mur le plus éloigné de la caméra : un mur entièrement devant le centre est coupé
      const depth = Math.max((s.a.x - center.x) * f.x + (s.a.y - center.y) * f.y, (s.b.x - center.x) * f.x + (s.b.y - center.y) * f.y)
      return depth < -margin
    })
  }

  /** Affiche chaque mur entier ou coupé, raccordé à ses voisins. */
  private showWalls(cut: boolean[]) {
    const k = this.walls.length
    this.walls.forEach((w, i) => {
      const pc = cut[(i - 1 + k) % k], nc = cut[(i + 1) % k]
      const full = cut[i] ? -1 : (pc ? 1 : 0) | (nc ? 2 : 0)
      const stub = cut[i] ? (pc ? 0 : 1) | (nc ? 0 : 2) : -1
      w.fulls.forEach((g, b) => (g.visible = b === full))
      w.stubs.forEach((g, b) => (g.visible = b === stub))
      w.fixtures.visible = !cut[i]
    })
  }

  private tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (this.mode === 'orbit') {
      this.orbit.update()
      // vue « maison de poupée » : les murs entre la caméra et la pièce sont coupés
      const c = { x: this.camera.position.x / M, y: this.camera.position.z / M }
      const cut = this.opts.cutaway ? this.cutWalls(c) : this.walls.map(() => false)
      this.showWalls(cut)
    } else {
      this.showWalls(this.walls.map(() => false))
      this.walk.update(dt)
    }
    this.renderer.render(this.scene, this.camera)
  }

  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private clearContent() {
    this.content.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.geometry.dispose()
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        for (const x of mats) {
          if (x === this.restMat) continue
          const mm = x as THREE.MeshStandardMaterial
          // les textures de peinture sont en cache : seule celle du sol est libérée
          if (mm.map && ![...this.textures.values()].includes(mm.map)) mm.map.dispose()
          x.dispose()
        }
      }
    })
    this.content.clear()
    this.walls = []
    this.ceiling = null
  }

  dispose() {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.ro.disconnect()
    this.walk.dispose()
    this.orbit.dispose()
    this.clearContent()
    for (const t of this.textures.values()) t.dispose()
    this.textures.clear()
    this.restMat.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
