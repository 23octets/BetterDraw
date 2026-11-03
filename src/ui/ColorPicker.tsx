import { useEffect, useRef, useState } from 'react'

/** Nuanciers proposés (tons de peinture murale courants). */
const SWATCHES: { name: string; colors: string[] }[] = [
  { name: 'Terres', colors: ['#c8643b', '#a84f2e', '#d98c5f', '#e0a43a', '#b8862c', '#8c5a3c', '#6e4a32', '#e7c9a0'] },
  { name: 'Verts', colors: ['#9caf88', '#6f8f6a', '#4a6b4f', '#2f4a3a', '#b9c7a3', '#7a9a8c', '#3f6b5e', '#d4dcc4'] },
  { name: 'Bleus', colors: ['#1f6f78', '#2a5d84', '#3d7ea6', '#7aa6c2', '#b7d0de', '#24435c', '#5c7c99', '#9fb7c9'] },
  { name: 'Roses & rouges', colors: ['#e8b4a6', '#d98c8c', '#c25b5b', '#9e3a3a', '#f2d0c4', '#b5717a', '#7d3c4a', '#f4e1dc'] },
  { name: 'Neutres', colors: ['#ffffff', '#f4f1ea', '#e6dfd3', '#cfc6b8', '#a39a8c', '#6e675d', '#33363b', '#1d1f22'] },
]

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0]
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('')
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255)
}

type Tab = 'swatches' | 'hsl' | 'rgb'

/**
 * Sélecteur de couleur en popover : nuancier, teinte / saturation / luminosité, RGB + hex,
 * sélecteur du système et pipette d'écran (si le navigateur la propose).
 * `onPreview` pendant le réglage, `onChange` pour valider (une entrée d'historique).
 */
export function ColorPicker({ value, onChange, onPreview, onClose, anchor }: { value: string; onChange: (hex: string) => void; onPreview?: (hex: string | null) => void; onClose: () => void; anchor: HTMLElement | null }) {
  const [tab, setTab] = useState<Tab>('swatches')
  const [hex, setHex] = useState(value)
  const [hexTxt, setHexTxt] = useState(value)
  const ref = useRef<HTMLDivElement>(null)
  const [r, g, b] = hexToRgb(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const [hsl, setHsl] = useState<[number, number, number]>([h, s, l])
  const pos = anchor?.getBoundingClientRect()

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) done()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onPreview?.(null)
        onClose()
      }
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc, true)
    }
  })

  const live = (x: string) => {
    setHex(x)
    setHexTxt(x)
    onPreview?.(x)
  }
  const done = () => {
    onPreview?.(null)
    if (hex.toLowerCase() !== value.toLowerCase()) onChange(hex)
    onClose()
  }
  const pick = (x: string) => {
    live(x)
    setHsl(rgbToHsl(...hexToRgb(x)))
  }
  const eyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper

  return (
    <div
      ref={ref}
      className="color-picker"
      role="dialog"
      aria-label="Choisir une couleur"
      data-testid="color-picker"
      style={pos ? { top: Math.min(pos.bottom + 6, window.innerHeight - 380), left: Math.max(8, Math.min(pos.left - 120, window.innerWidth - 296)) } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="cp-head">
        <span className="cp-preview" style={{ background: hex }} />
        <input className="cp-hex" value={hexTxt} data-testid="cp-hex" spellCheck={false}
          onChange={(e) => {
            setHexTxt(e.target.value)
            const v = e.target.value.trim()
            if (/^#?[0-9a-f]{6}$/i.test(v)) pick(v.startsWith('#') ? v : `#${v}`)
          }} />
        {eyeDropper && (
          <button className="icon-btn small" title="Prendre une couleur à l’écran" onClick={async () => {
            try {
              const res = await new eyeDropper().open()
              pick(res.sRGBHex)
            } catch { /* annulé */ }
          }}>
            <svg viewBox="0 0 22 22" width="15" height="15" className="icon"><path d="M14 4l4 4-9 9H5v-4zM12 6l4 4" /></svg>
          </button>
        )}
        <label className="icon-btn small cp-native" title="Sélecteur du système">
          <input type="color" value={hex} onChange={(e) => pick(e.target.value)} />
          <svg viewBox="0 0 22 22" width="15" height="15" className="icon"><circle cx="11" cy="11" r="7" /><path d="M11 4v14M4 11h14" /></svg>
        </label>
      </div>
      <div className="seg cp-tabs" role="tablist">
        <button className={tab === 'swatches' ? 'on' : ''} onClick={() => setTab('swatches')} data-testid="cp-tab-swatches">Nuancier</button>
        <button className={tab === 'hsl' ? 'on' : ''} onClick={() => setTab('hsl')} data-testid="cp-tab-hsl">TSL</button>
        <button className={tab === 'rgb' ? 'on' : ''} onClick={() => setTab('rgb')} data-testid="cp-tab-rgb">RVB</button>
      </div>
      {tab === 'swatches' && (
        <div className="cp-swatches">
          {SWATCHES.map((grp) => (
            <div key={grp.name}>
              <span className="cp-group">{grp.name}</span>
              <div className="cp-row">
                {grp.colors.map((c) => (
                  <button key={c} className={`cp-swatch${c.toLowerCase() === hex.toLowerCase() ? ' on' : ''}`} style={{ background: c }} title={c} aria-label={c} data-testid={`cp-swatch-${c.slice(1)}`} onClick={() => pick(c)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'hsl' && (
        <div className="cp-sliders">
          {(['Teinte', 'Saturation', 'Luminosité'] as const).map((label, i) => {
            const max = i === 0 ? 360 : 100
            const bg =
              i === 0
                ? 'linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
                : i === 1
                  ? `linear-gradient(90deg, ${hslToHex(hsl[0], 0, hsl[2])}, ${hslToHex(hsl[0], 100, hsl[2])})`
                  : `linear-gradient(90deg, #000, ${hslToHex(hsl[0], hsl[1], 50)}, #fff)`
            return (
              <label key={label} className="range-field">
                <span>{label} <b>{Math.round(hsl[i])}{i === 0 ? '°' : ' %'}</b></span>
                <input type="range" min={0} max={max} value={hsl[i]} className="cp-range" style={{ background: bg }} data-testid={`cp-hsl-${i}`}
                  onChange={(e) => {
                    const next = [...hsl] as [number, number, number]
                    next[i] = +e.target.value
                    setHsl(next)
                    live(hslToHex(...next))
                  }} />
              </label>
            )
          })}
        </div>
      )}
      {tab === 'rgb' && (
        <div className="cp-sliders">
          {(['Rouge', 'Vert', 'Bleu'] as const).map((label, i) => {
            const vals = [r, g, b]
            return (
              <label key={label} className="range-field">
                <span>{label} <b>{vals[i]}</b></span>
                <input type="range" min={0} max={255} value={vals[i]} className="cp-range" data-testid={`cp-rgb-${i}`}
                  style={{ background: `linear-gradient(90deg, ${toHex(...(vals.map((v, k) => (k === i ? 0 : v)) as [number, number, number]))}, ${toHex(...(vals.map((v, k) => (k === i ? 255 : v)) as [number, number, number]))})` }}
                  onChange={(e) => {
                    const next = [...vals]
                    next[i] = +e.target.value
                    pick(toHex(next[0], next[1], next[2]))
                  }} />
              </label>
            )
          })}
        </div>
      )}
      <div className="cp-foot">
        <button className="ghost small" onClick={() => { onPreview?.(null); onClose() }}>Annuler</button>
        <button className="primary small" onClick={done} data-testid="cp-apply">Appliquer</button>
      </div>
    </div>
  )
}
