import { useEffect } from 'react'
import { useApp } from '../app/context'
import type { S89Payload } from '../data/types'
import './overlays.css'

/**
 * Digitales S-89-Formular („Aufgabe in der Leben-und-Dienst-Zusammenkunft“).
 * Bottom-Sheet mobil / zentriertes Modal desktop; liegt über dem
 * Zuteilungs-Sheet. Geöffnet aus Meine Aufgaben und dem Zuteilungs-Sheet.
 */
export function S89Sheet({ payload }: { payload: S89Payload }) {
  const { dispatch } = useApp()
  const close = () => dispatch({ type: 'closeS89' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dispatch({ type: 'closeS89' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  const rows: Array<[string, string]> = [
    ['Name', payload.name],
    ...(payload.partner ? ([['Gesprächspartner/in', payload.partner]] as [string, string][]) : []),
    ['Datum', payload.date],
    ['Aufgabe', payload.type],
    ...(payload.point ? ([['Schulungspunkt', payload.point]] as [string, string][]) : []),
    ['Durchzuführen im', 'Hauptsaal'],
  ]

  return (
    <>
      <div className="sheet-backdrop sheet-backdrop--s89" onClick={close} />
      <div
        className="sheet sheet--s89"
        role="dialog"
        aria-modal="true"
        aria-label="S-89 Formular"
      >
        <div className="sheet-head">
          <div>
            <div className="s89-eyebrow">S-89</div>
            <div className="sheet-title">Aufgabe in der Leben-und-Dienst-Zusammenkunft</div>
          </div>
          <button type="button" className="sheet-close" aria-label="Schließen" onClick={close}>
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
        <p className="s89-note">
          Hinweis: Quelle und Schulungspunkt für deine Aufgabe findest du im Arbeitsheft.
        </p>
      </div>
    </>
  )
}
