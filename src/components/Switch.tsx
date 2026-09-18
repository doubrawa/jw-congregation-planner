/**
 * Der Ein/Aus-Schalter der App — ein Knopf, kein `<input type="checkbox">`.
 *
 * Er stand achtmal wortgleich im Baum (Einstellungen, Treffpunkt-Regeln,
 * Erinnerungen, Aufgabenbereiche, Planer-Recht, S-89-Bogen, Sonderwoche,
 * Profil). Jede Abschrift trug dieselben vier Zuschreibungen für die
 * Bedienbarkeit — `role`, `aria-checked`, `aria-label` und den Knauf. Eine
 * Verbesserung daran hätte man achtmal machen müssen, und genau so entstehen
 * hier sonst Lücken: Eine Stelle wird vergessen, und nichts schlägt fehl —
 * der Schalter sieht gleich aus und sagt einem Vorleseprogramm etwas anderes.
 *
 * Das Aussehen bleibt im Stylesheet (`.switch`, `.switch-knob`); die
 * Umgebungen bringen ihre eigene Zeile samt Beschriftung mit.
 */
export function Switch({
  on,
  label,
  onToggle,
  disabled,
}: {
  on: boolean
  /** Beschriftung für Vorleseprogramme — sichtbar steht sie in der Zeile daneben. */
  label: string
  onToggle: () => void
  /** Gesperrt, z. B. das eigene Planer-Recht (sonst sperrt man sich selbst aus). */
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={on ? 'switch is-on' : 'switch'}
      onClick={onToggle}
    >
      <span className="switch-knob" />
    </button>
  )
}
