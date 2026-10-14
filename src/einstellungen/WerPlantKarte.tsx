import { useApp } from '../app/context'
import { namenSatz } from '../components/namen-satz'
import { personLabel } from '../data/helpers'
import { useT } from '../i18n/useT'
import { EinstellZeile } from './EinstellZeile'
import { werPlant } from './einstellungen-anzeige'

/**
 * **Wer plant** (T121, Entwurf `GEinstellungen`): alle, die planen dürfen, und
 * die Admins, als ein Satz. Vergeben wird das Recht bei der Person (Karte
 * „Rechte") — die Zeile darunter führt zu den Personen.
 */
export function WerPlantKarte() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const planer = werPlant(state.persons, state.members, state.lang)
  return (
    <section className="karte einst-karte">
      <h2 className="abschnitt-titel karte-titel">{t.werPlant}</h2>
      {/* Ohne `dir="auto"`, wie die Zugesagten der Woche: Der Satz gehört der
          Oberfläche (die Verbindung „und" kommt aus `Intl`), nur die Namen darin
          der Versammlung. */}
      <p className="einst-namen">
        {planer.length > 0 ? namenSatz(planer.map(personLabel), state.lang) : t.werPlantNiemand}
      </p>
      <EinstellZeile name={t.beiDerPersonAendern} onTipp={() => dispatch({ type: 'navigate', screen: 'personen' })} />
    </section>
  )
}
