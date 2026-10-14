import { Zeichen } from '../bausteine/Zeichen'

/**
 * **Eine Zeile der Einstellungen** (T121, Entwurf `GEinstellungen`): links,
 * was eingestellt wird, darunter auf Wunsch eine Erläuterung, rechts der Wert —
 * ein Tipp öffnet, wo er sich ändern lässt.
 *
 * `eigen` bzw. `eigenerName`: Der Wert bzw. der Name gehört der Versammlung,
 * nicht der App (ihr Name, die Anschrift des Saals, der Name einer Gruppe) — er
 * steht in seiner eigenen Richtung (`dir="auto"`), wie die Personenfelder.
 */
export function EinstellZeile({
  name,
  unter,
  wert,
  eigen = false,
  eigenerName = false,
  onTipp,
}: {
  name: string
  unter?: string
  wert?: string
  eigen?: boolean
  eigenerName?: boolean
  onTipp: () => void
}) {
  return (
    <button type="button" className="einst-zeile" onClick={onTipp}>
      <span className="einst-zeile-text">
        <span className="einst-zeile-name" dir={eigenerName ? 'auto' : undefined}>
          {name}
        </span>
        {unter && <span className="klein-text">{unter}</span>}
      </span>
      <span className="einst-zeile-wert" dir={eigen ? 'auto' : undefined}>
        {wert}
      </span>
      <Zeichen name="weiter" />
    </button>
  )
}
