import { useEffect, useRef, useState } from 'react'
import type { RoomPlan } from '../model/types'
import { RoomScene, type ViewMode, type WallPaint } from './scene3d'
import { Icon } from '../ui/icons'

/** Vue 3D de la pièce : orbite « maison de poupée » ou visite à la première personne. */
export function Room3D({ room, paints, selected, onPick }: { room: RoomPlan; paints: WallPaint[]; selected: number | null; onPick: (i: number | null, open: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<RoomScene | null>(null)
  const [mode, setMode] = useState<ViewMode>('orbit')
  const [locked, setLocked] = useState(false)
  const [lines, setLines] = useState(false)
  const [cutaway, setCutaway] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    let s: RoomScene
    try {
      s = new RoomScene(host.current!)
    } catch (e) {
      console.error(e)
      setError('La 3D n’est pas disponible dans ce navigateur (WebGL).')
      return
    }
    scene.current = s
    s.onPick = (i, open) => pick.current(i, open)
    s.onModeChange = setMode
    s.onLockChange = setLocked
    ;(window as unknown as { __roomScene?: RoomScene }).__roomScene = s
    return () => {
      s.dispose()
      scene.current = null
    }
  }, [])

  useEffect(() => {
    scene.current?.setRoom(room, paints)
  }, [room, paints])

  useEffect(() => scene.current?.setSelected(selected), [selected, paints])
  useEffect(() => scene.current?.setOptions({ lines, cutaway }), [lines, cutaway])

  return (
    <div className="room-3d" data-testid="room-3d">
      <div ref={host} className="room-3d-host" />
      {error && <p className="room-3d-error">{error}</p>}
      <div className="room-3d-bar hud-pill">
        <div className="seg" role="group" aria-label="Navigation 3D">
          <button className={mode === 'orbit' ? 'on' : ''} onClick={() => scene.current?.setMode('orbit')} data-testid="mode-orbit" title="Tourner autour de la pièce">Orbite</button>
          <button className={mode === 'walk' ? 'on' : ''} onClick={() => { scene.current?.setMode('walk'); scene.current?.lock() }} data-testid="mode-walk" title="Se promener dans la pièce">Visite</button>
        </div>
        {mode === 'orbit' && (
          <>
            <label className="check"><input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} data-testid="toggle-cutaway" /> Murs coupés</label>
            <button className="icon-btn" onClick={() => scene.current?.frame()} title="Recadrer" data-testid="frame-3d"><Icon name="fit" /></button>
          </>
        )}
        <label className="check"><input type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} data-testid="toggle-lines" /> Traits</label>
      </div>
      {mode === 'walk' && !locked && (
        <div className="room-3d-tip" onClick={() => scene.current?.lock()}>
          Clique pour regarder autour · <kbd className="key small">Z</kbd><kbd className="key small">Q</kbd><kbd className="key small">S</kbd><kbd className="key small">D</kbd> ou flèches pour marcher · <kbd className="key small">⇧</kbd> courir · <kbd className="key small">Échap</kbd> libérer la souris
        </div>
      )}
      {mode === 'orbit' && <p className="room-3d-help">Glisser : tourner · clic droit : déplacer · molette : zoom · double-clic sur un mur : le peindre</p>}
    </div>
  )
}
