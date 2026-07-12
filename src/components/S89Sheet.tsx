import { useEffect } from 'react'
import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import type { S89Payload } from '../data/types'
import './overlays.css'

/**
 * Digitales S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“).
 * Bottom-Sheet mobil / zentriertes Modal desktop; liegt über dem
 * Zuteilungs-Sheet. Geöffnet aus Meine Aufgaben und dem Zuteilungs-Sheet.
 */
export function S89Sheet({ payload }: { payload: S89Payload }) {
  const { dispatch } = useApp()
  const { t, tp } = useT()
  const close = () => dispatch({ type: 'closeS89' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeS89' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  const rows: Array<[string, string]> = [
    [t.s89Name, payload.name],
    ...(payload.partner ? ([[t.s89Partner, payload.partner]] as [string, string][]) : []),
    [t.s89Datum, tp(payload.date)],
    [t.s89Aufgabe, tp(payload.type)],
    ...(payload.point ? ([[t.s89Punkt, tp(payload.point)]] as [string, string][]) : []),
    [t.s89Ort, t.s89Hauptsaal],
  ]

  return (
    <>
      <div className="sheet-backdrop sheet-backdrop--s89" onClick={close} />
      <div className="sheet sheet--s89" role="dialog" aria-modal="true" aria-label={t.s89Title}>
        <div className="sheet-head">
          <div>
            <div className="s89-eyebrow">S-89</div>
            <div className="sheet-title">{t.s89Title}</div>
          </div>
          <button type="button" className="sheet-close" aria-label="✕" onClick={close}>
            ✕
          </button>
        </div>
        <div className="s89-box">
          {rows.map(([label, value]) => (
            <div key={label} className="s89-row">
              <div className="s89-label">{label}</div>
              <div className="s89-value">{value}</div>
            </div>
          ))}
        </div>
        <p className="s89-note">{t.s89Note}</p>
      </div>
    </>
  )
}
