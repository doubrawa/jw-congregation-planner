import { useState } from 'react'
import { useApp } from '../app/context'
import { useT } from '../i18n/useT'

/**
 * Eine Bereichszeile: Label (Aufgaben / Hilfsdienste) und darunter zwei Aktionen
 * auf einer Linie — „Automatisch" (primär, füllt) und „Leeren" (sekundär, leert).
 * „Leeren" ist destruktiv und deshalb mit Zwei-Tipp-Bestätigung: der erste Tipp
 * bewaffnet den Button („Wirklich leeren?"), erst der zweite leert wirklich.
 * Verlässt der Fokus den Button, entschärft er sich wieder.
 */
function AutoAssignRow({ label, scope }: { label: string; scope: 'parts' | 'helpers' }) {
  const { dispatch } = useApp()
  const { t } = useT()
  const [armed, setArmed] = useState(false)

  return (
    <div className="plan-auto-row">
      <div className="plan-auto-label">{label}</div>
      <div className="plan-auto-actions">
        <button
          type="button"
          className="plan-auto-btn plan-auto-btn--primary"
          onClick={() => {
            setArmed(false)
            dispatch({ type: 'autoAssign', scope })
          }}
        >
          {t.autoZuteilen}
        </button>
        <button
          type="button"
          className={`plan-auto-btn plan-auto-btn--clear${armed ? ' is-armed' : ''}`}
          onClick={() => {
            if (armed) {
              setArmed(false)
              dispatch({ type: 'clearAssignments', scope })
            } else {
              setArmed(true)
            }
          }}
          onBlur={() => setArmed(false)}
        >
          {armed ? t.leerenSicher : t.leeren}
        </button>
      </div>
    </div>
  )
}

/**
 * Auto-Zuteilen/Leeren für Programmpunkte (Aufgaben) und Hilfsdienste — je eine
 * Zeile. Wirkt auf die aktuell im Planen-Screen gewählte Woche und Zusammenkunft.
 */
export function AutoAssignPanel() {
  const { t } = useT()
  return (
    <div className="plan-auto">
      <AutoAssignRow label={t.navAufgaben} scope="parts" />
      <AutoAssignRow label={t.hilfsdienste} scope="helpers" />
    </div>
  )
}
