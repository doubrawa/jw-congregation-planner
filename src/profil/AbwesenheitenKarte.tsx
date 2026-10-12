import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt } from '../bausteine/Punkt'
import { AbwesenheitEintragen } from '../components/AbwesenheitEintragen'
import { AbwesenheitEntfernen } from '../components/AbwesenheitEntfernen'
import { datumsFormat } from '../components/datum-anzeige'
import { fromIso } from '../data/meeting-dates'
import type { Absence } from '../data/types'
import { useT } from '../i18n/useT'
import { eigeneAbwesenheiten } from './abwesenheiten'

/** Ein Zeitraum in Worten — ein einzelner Tag einmal, nicht „1. – 1. November". */
function zeitraum(a: Absence, lang: string): string {
  const fmt = datumsFormat(lang, 'kurzerWochentag')
  return a.from === a.to ? fmt.format(fromIso(a.from)) : fmt.formatRange(fromIso(a.from), fromIso(a.to))
}

/**
 * **Die eigenen Abwesenheiten** im Profil (T121): was ansteht oder gerade läuft,
 * mit ✕ (zwei Tipps) — und darunter „Abwesenheit eintragen". Was vorbei ist,
 * steht nicht mehr da: Es teilt ohnehin niemand mehr dorthin ein.
 */
export function AbwesenheitenKarte() {
  const { state } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const liste = eigeneAbwesenheiten(state.absences, state, heute)

  return (
    <section className="karte profil-karte">
      <h2 className="abschnitt-titel profil-karte-titel">{t.abwesenheiten}</h2>
      {liste.map((a) => (
        <div key={a.id} className="profil-abw">
          <Punkt art="problem" />
          <span className="profil-abw-text">
            <span className="profil-abw-zeit">{zeitraum(a, state.lang)}</span>
            {a.reason && (
              <span className="klein-text" dir="auto">
                {a.reason}
              </span>
            )}
          </span>
          <AbwesenheitEntfernen id={a.id} className="profil-abw-entfernen" />
        </div>
      ))}
      <AbwesenheitEintragen personId={state.personId} />
    </section>
  )
}
