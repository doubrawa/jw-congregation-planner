import { useAppDispatch } from '../app/context'
import { useZweiTipp } from '../components/useZweiTipp'
import { useT } from '../i18n/useT'

/**
 * Eine Bereichszeile: Label (Aufgaben / Hilfsdienste / Treffpunkt-Leiter) und
 * darunter zwei Aktionen auf einer Linie — „Automatisch" (primär, füllt) und
 * „Leeren" (sekundär, leert). „Leeren" ist destruktiv und deshalb mit
 * Zwei-Tipp-Bestätigung (`useZweiTipp`).
 *
 * Was die beiden Aktionen tun, sagt der Aufrufer: Die Zusammenkünfte und die
 * Treffpunkte haben eigene Aktionen, aber dieselbe Zeile — sie stand zweimal da.
 */
export function AutoAssignRow({
  label,
  automatisch,
  leeren,
  aktion,
  bereit = true,
}: {
  label: string
  automatisch: () => void
  leeren: () => void
  /** Beschriftung des Hauptknopfs; ohne: „Automatisch zuteilen". Die Gruppenbesuche verteilen reihum (T120). */
  aktion?: string
  /** Fehlt noch etwas (bei den Gruppenbesuchen: der Besucher), ist der Hauptknopf gesperrt. */
  bereit?: boolean
}) {
  const { t } = useT()
  const bestaetigung = useZweiTipp(leeren)

  return (
    <div className="plan-auto-row">
      <div className="plan-auto-label">{label}</div>
      <div className="plan-auto-actions">
        <button
          type="button"
          className="plan-auto-btn plan-auto-btn--primary"
          disabled={!bereit}
          onClick={() => {
            bestaetigung.entschaerfen()
            automatisch()
          }}
        >
          {aktion ?? t.autoZuteilen}
        </button>
        <button
          type="button"
          className={`plan-auto-btn plan-auto-btn--clear${bestaetigung.armed ? ' is-armed' : ''}`}
          onClick={bestaetigung.onClick}
          onBlur={bestaetigung.onBlur}
        >
          {bestaetigung.armed ? t.leerenSicher : t.leeren}
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
  const dispatch = useAppDispatch()
  const { t } = useT()
  return (
    <div className="plan-auto">
      <AutoAssignRow
        label={t.navAufgaben}
        automatisch={() => dispatch({ type: 'autoAssign', scope: 'parts' })}
        leeren={() => dispatch({ type: 'clearAssignments', scope: 'parts' })}
      />
      <AutoAssignRow
        label={t.hilfsdienste}
        automatisch={() => dispatch({ type: 'autoAssign', scope: 'helpers' })}
        leeren={() => dispatch({ type: 'clearAssignments', scope: 'helpers' })}
      />
    </div>
  )
}
