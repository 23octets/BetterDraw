import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'

/** Segment de collision (en mètres, plan x/z), hors portes. */
export interface Collider {
  a: { x: number; y: number }
  b: { x: number; y: number }
  half: number
}

export const EYE = 1.6
const RADIUS = 0.25
const WALK = 1.6
const RUN = 3.2

/**
 * Visite à la première personne (repris de pasteur) : visée à la souris (pointer lock),
 * déplacement ZQSD / WASD / flèches, collisions glissantes contre les murs, portes traversables.
 */
export class WalkControls {
  private plc: PointerLockControls
  private keys = new Set<string>()
  private walls: Collider[] = []
  private dir = new THREE.Vector3()
  private lastUnlock = 0
  enabled = false
  onLockChange: (locked: boolean) => void = () => {}

  private onDown = (e: KeyboardEvent) => {
    if (!this.enabled || e.target instanceof HTMLInputElement) return
    this.keys.add(e.code)
    if (this.plc.isLocked && e.code.startsWith('Arrow')) e.preventDefault()
  }
  private onUp = (e: KeyboardEvent) => this.keys.delete(e.code)
  private onClick = () => {
    if (this.enabled && !this.plc.isLocked) this.lock()
  }
  private onLock = () => this.onLockChange(true)
  private onUnlock = () => {
    this.lastUnlock = performance.now()
    this.keys.clear()
    this.onLockChange(false)
  }

  private camera: THREE.Camera
  private dom: HTMLElement

  constructor(camera: THREE.Camera, dom: HTMLElement) {
    this.camera = camera
    this.dom = dom
    this.plc = new PointerLockControls(camera, dom)
    this.plc.addEventListener('lock', this.onLock)
    this.plc.addEventListener('unlock', this.onUnlock)
    dom.addEventListener('click', this.onClick)
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
  }

  /** Le navigateur refuse un nouveau verrou ~1 s après une libération : on ignore le rejet. */
  lock() {
    if (performance.now() - this.lastUnlock < 1100) return
    try {
      const p = this.dom.requestPointerLock() as unknown as Promise<void> | undefined
      p?.catch?.(() => {})
    } catch {
      /* refusé : le prochain clic réessaiera */
    }
  }

  unlock() {
    if (this.plc.isLocked) this.plc.unlock()
  }

  setColliders(c: Collider[]) {
    this.walls = c
  }

  /** Place l'œil en (x, z) (mètres), regard selon l'angle (plan). */
  place(x: number, z: number, angle: number) {
    this.camera.position.set(x, EYE, z)
    this.camera.lookAt(x + Math.cos(angle), EYE - 0.05, z + Math.sin(angle))
  }

  update(dt: number) {
    this.camera.position.y = EYE
    if (!this.enabled) return
    const k = this.keys
    const fwd = k.has('KeyW') || k.has('KeyZ') || k.has('ArrowUp')
    const back = k.has('KeyS') || k.has('ArrowDown')
    const left = k.has('KeyA') || k.has('KeyQ') || k.has('ArrowLeft')
    const right = k.has('KeyD') || k.has('ArrowRight')
    if (!fwd && !back && !left && !right) return
    this.camera.getWorldDirection(this.dir)
    let fx = this.dir.x, fz = this.dir.z
    const fl = Math.hypot(fx, fz) || 1
    fx /= fl
    fz /= fl
    // droite = avant tourné de +90° autour de y (repère main droite, z vers « le bas » du plan)
    const rx = -fz, rz = fx
    let mx = 0, mz = 0
    if (fwd) { mx += fx; mz += fz }
    if (back) { mx -= fx; mz -= fz }
    if (right) { mx += rx; mz += rz }
    if (left) { mx -= rx; mz -= rz }
    const ml = Math.hypot(mx, mz)
    if (ml < 1e-6) return
    const sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK) * dt
    mx = (mx / ml) * sp
    mz = (mz / ml) * sp
    const p = this.camera.position
    if (!this.collides(p.x + mx, p.z)) p.x += mx
    if (!this.collides(p.x, p.z + mz)) p.z += mz
  }

  private collides(x: number, y: number) {
    for (const w of this.walls) if (distToSeg(x, y, w.a.x, w.a.y, w.b.x, w.b.y) < RADIUS + w.half) return true
    return false
  }

  dispose() {
    this.unlock()
    this.plc.removeEventListener('lock', this.onLock)
    this.plc.removeEventListener('unlock', this.onUnlock)
    this.plc.dispose()
    this.dom.removeEventListener('click', this.onClick)
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
  }
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
