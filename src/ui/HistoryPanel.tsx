import { useEffect, useState } from 'react'
import { useEditor, flushPersistence } from '../store/editor'
import * as repo from '../store/repo'

interface Row {
  seq: number
  label: string
  ts: number
}

const fmtTime = (ts: number) => {
  const d = new Date(ts)
  const today = new Date()
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString('fr-FR')} ${time}`
}

export function HistoryPanel() {
  const variant = useEditor((s) => s.variant)
  const headSeq = useEditor((s) => s.headSeq)
  const maxSeq = useEditor((s) => s.maxSeq)
  const rev = useEditor((s) => s.rev)
  const goTo = useEditor((s) => s.goTo)
  const [rows, setRows] = useState<Row[]>([])
  const [slider, setSlider] = useState(headSeq)

  useEffect(() => setSlider(headSeq), [headSeq])

  useEffect(() => {
    if (!variant) return
    let alive = true
    flushPersistence().then(() =>
      repo.listEntries(variant.id).then((es) => {
        if (alive) setRows(es.map((e) => ({ seq: e.seq, label: e.label, ts: e.ts })).reverse())
      }),
    )
    return () => {
      alive = false
    }
  }, [variant, rev])

  return (
    <div className="history" data-testid="history-panel">
      <div className="history-head">
        <strong data-testid="history-count">{maxSeq} modification{maxSeq > 1 ? 's' : ''}</strong>
        <span className="muted">position {headSeq}</span>
      </div>
      <input
        type="range"
        className="history-slider"
        data-testid="history-slider"
        min={0}
        max={maxSeq}
        value={slider}
        onChange={(e) => {
          const v = +e.target.value
          setSlider(v)
          goTo(v)
        }}
      />
      <p className="hint" style={{ margin: 0 }}>
        Glisse pour remonter le temps. Rien n’est jamais perdu : modifier après un retour en arrière ajoute une étape « Retour à l’état ».
      </p>
      <ol className="history-list">
        {rows.map((r) => (
          <li key={r.seq}>
            <button
              className={`history-item${r.seq === headSeq ? ' current' : ''}${r.seq > headSeq ? ' future' : ''}`}
              data-testid="history-item"
              onClick={() => goTo(r.seq)}
            >
              <span className="seq">#{r.seq}</span>
              <span className="label">{r.label}</span>
              <span className="time">{fmtTime(r.ts)}</span>
            </button>
          </li>
        ))}
        <li>
          <button className={`history-item${headSeq === 0 ? ' current' : ''}`} data-testid="history-item" onClick={() => goTo(0)}>
            <span className="seq">#0</span>
            <span className="label">État initial</span>
            <span className="time">{variant ? fmtTime(variant.createdAt) : ''}</span>
          </button>
        </li>
      </ol>
    </div>
  )
}
