import { useZweiTipp } from '../components/useZweiTipp'
import { useT } from '../i18n/useT'

/**
 * Eine Bereichszeile: Label (Treffpunkt-Leiter, Schichten, Gruppenbesuche) und
 * darunter zwei Aktionen auf einer Linie — „Automatisch" (primär, füllt) und
 * „Leeren" (sekundär, leert). „Leeren" ist destruktiv und deshalb mit
 * Zwei-Tipp-Bestätigung (`useZweiTipp`).
 *
 * Was die beiden Aktionen tun, sagt der Aufrufer. Die Zusammenkünfte haben sie
 * seit T121 (Phase 5c) im Blatt „Automatisch zuteilen" (`AutomatischBlatt`).
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
