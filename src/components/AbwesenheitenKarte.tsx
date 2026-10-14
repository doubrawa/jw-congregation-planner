import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt } from '../bausteine/Punkt'
import { darfAbwesenheitBearbeiten } from '../data/rechte'
import type { Person } from '../data/types'
import { useT } from '../i18n/useT'
import { AbwesenheitEintragen } from './AbwesenheitEintragen'
import { AbwesenheitEntfernen } from './AbwesenheitEntfernen'
import { abwesenheitenVon, eigeneAbwesenheiten } from './abwesenheiten'
import { tageSpanne } from './datum-anzeige'

/**
 * **Abwesenheiten** (T121): was ansteht oder gerade läuft, je mit ✕ (zwei
 * Tipps) — und darunter „Abwesenheit eintragen". Was vorbei ist, steht nicht
 * mehr da: Es teilt ohnehin niemand mehr dorthin ein.
 *
 * Im Profil die eigenen, bei einer Person in den Personen deren (Entwurf
 * `GPerson`). Entfernen und eintragen darf, wen es betrifft, oder ein Admin —
 * dieselbe Grenze wie in der Datenbank (`absences_write`).
 */
export function AbwesenheitenKarte({ person }: { person?: Person }) {
  const { state } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const personId = person ? person.id : state.personId
  const liste = person ? abwesenheitenVon(state.absences, person.id, heute) : eigeneAbwesenheiten(state.absences, state, heute)
  const darf = darfAbwesenheitBearbeiten(state, personId)

  return (
    <section className="karte abw-karte">
      <h2 className="abschnitt-titel karte-titel">{t.abwesenheiten}</h2>
      {liste.length === 0 && <p className="klein-text abw-leer">{t.keineAbwesenheiten}</p>}
      {liste.map((a) => (
        <div key={a.id} className="abw-zeile">
          <Punkt art="problem" />
          <span className="abw-zeile-text">
            <span className="abw-zeile-zeit">{tageSpanne(a.from, a.to, state.lang, 'kurzerWochentag')}</span>
            {a.reason && (
              <span className="klein-text" dir="auto">
                {a.reason}
              </span>
            )}
          </span>
          {darf && <AbwesenheitEntfernen id={a.id} className="rund-knopf rund-knopf--feld abw-entfernen" />}
        </div>
      ))}
      <AbwesenheitEintragen personId={personId} />
    </section>
  )
}
