import { useEffect, useState } from 'react'

/** Champ numérique qui ne valide qu'au blur ou à Entrée (une entrée d'historique par saisie). */
export function NumberField(props: {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  testId?: string
  disabled?: boolean
}) {
  const [txt, setTxt] = useState(String(props.value))
  useEffect(() => setTxt(String(props.value)), [props.value])
  const commit = () => {
    const n = parseFloat(txt.replace(',', '.'))
    if (!Number.isFinite(n)) return setTxt(String(props.value))
    let c = n
    if (props.min !== undefined) c = Math.max(props.min, c)
    if (props.max !== undefined) c = Math.min(props.max, c)
    if (c !== props.value) props.onCommit(c)
    setTxt(String(c))
  }
  return (
    <label className="field">
      <span>{props.label}</span>
      <span className="field-input">
        <input
          data-testid={props.testId}
          inputMode="decimal"
          disabled={props.disabled}
          value={txt}
          step={props.step}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setTxt(String(props.value))
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {props.suffix && <em>{props.suffix}</em>}
      </span>
    </label>
  )
}

export function TextField(props: { label?: string; value: string; onCommit: (v: string) => void; testId?: string; className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const [txt, setTxt] = useState(props.value)
  useEffect(() => setTxt(props.value), [props.value])
  const input = (
    <input
      className={props.className}
      data-testid={props.testId}
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      autoFocus={props.autoFocus}
      onFocus={(e) => props.autoFocus && e.target.select()}
      onBlur={() => {
        if (txt.trim() && txt !== props.value) props.onCommit(txt.trim())
        else setTxt(props.value)
        props.onDone?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setTxt(props.value)
          props.onDone?.()
        }
      }}
    />
  )
  if (!props.label) return input
  return (
    <label className="field">
      <span>{props.label}</span>
      {input}
    </label>
  )
}
