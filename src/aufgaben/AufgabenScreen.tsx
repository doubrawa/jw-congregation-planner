import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt } from '../bausteine/Punkt'
import { Zeichen } from '../bausteine/Zeichen'
import { fromIso } from '../data/meeting-dates'
import { LAGE_DER_ZUSAGE } from '../data/saal'
import { eigeneTermine } from '../data/trolleys'
import { aufgabenLabel, useT } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import { mitWem, tagKurz, trolleyNameVon, zeitSpanne, zuDenTrolleys } from '../trolleys/trolley-anzeige'
import { aufgabeWann } from './aufgabe-anzeige'
import { AufgabeKarte } from './AufgabeKarte'
import './aufgaben.css'

/**
 * **Meine Aufgaben** (T121): alles, was ansteht — die nächste Aufgabe groß,
 * die übrigen je eine Zeile mit einem Haken zum Bestätigen, „Alle bestätigen"
 * für alles auf einmal; dann die eigenen Trolley-Termine. Was man übernehmen
 * kann (Einspringen, freie Plätze), steht seit dem 24.10.2026 unter „Freie
 * Plätze" (`FreiePlaetzeScreen`, T134). Die eigenen Abwesenheiten
 * stehen seit dem Umbau im Profil, der Hinweis auf Benachrichtigungen auf den
 * Mitteilungen.
 */
export function AufgabenScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n

  const [naechste, ...weitere] = state.myTasks
  const zuBestaetigen = state.myTasks.filter((task) => task.status === 'offen').length

  return (
    <section className="screen aufgaben">
      <div className="aufgaben-kopf">
        <h1 className="seitentitel seitentitel--gross">{t.navAufgabenLong}</h1>
        {zuBestaetigen > 0 && (
          <div className="aufgaben-zusage">
            <span className="klein-text">{zahlBinden(`${t.dashZuBest}: ${zuBestaetigen}`)}</span>
            {zuBestaetigen > 1 && (
              <button type="button" className="knopf-pille" onClick={() => dispatch({ type: 'confirmAll' })}>
                {t.alleBestaetigen}
              </button>
            )}
          </div>
        )}
      </div>

      {naechste ? <AufgabeKarte task={naechste} /> : <p className="karte karte--held aufgaben-leer">{t.dashKeineAufgabe}</p>}

      {weitere.length > 0 && (
        <div className="karte aufgaben-liste">
          {weitere.map((task) => {
            const label = aufgabenLabel(task, i18n)
            return (
              <div key={task.id} className="aufgaben-zeile">
                <Punkt art={LAGE_DER_ZUSAGE[task.status]} />
                <button type="button" className="aufgaben-zeile-text" onClick={() => dispatch({ type: 'openMyTask', id: task.id })}>
                  <span className="aufgaben-zeile-titel">{label}</span>
                  <span className="klein-text">{aufgabeWann(task, state.lang, i18n)}</span>
                </button>
                {task.status === 'offen' ? (
                  <button
                    type="button"
                    className="knopf-haken"
                    aria-label={`${label}: ${t.bestaetigen}`}
                    onClick={() => dispatch({ type: 'confirmTask', id: task.id })}
                  >
                    <Zeichen name="haken" />
                  </button>
                ) : (
                  <span className="aufgaben-zeile-pfeil">
                    <Zeichen name="weiter" />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <TrolleyTermine />
    </section>
  )
}

/**
 * **Trolley** (T121, Phase 7, Entwurf `GAufgaben`): die eigenen Trolley-Termine
 * — für sich, denn wer sich eingetragen hat, hat sich verabredet; eine Zusage
 * gibt es nicht. Ein Tipp führt zu den Trolleys.
 */
function TrolleyTermine() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const ich = eigenePerson(state)?.id
  const termine = eigeneTermine(state.trolleyTermine, ich, fromIso(heute))
  if (termine.length === 0) return null
  return (
    <section className="aufgaben-abschnitt" data-bereich="trolley">
      <h2 className="abschnitt-titel">{t.privZeugnis}</h2>
      <div className="karte aufgaben-liste">
        {termine.map((termin) => (
          <div key={termin.id} className="aufgaben-zeile">
            <Punkt art={termin.partner ? 'voll' : 'offen'} />
            <button type="button" className="aufgaben-zeile-text" onClick={() => zuDenTrolleys(dispatch)}>
              <span className="aufgaben-zeile-titel" dir="auto">
                {`${trolleyNameVon(state.trolleys, termin.trolleyId)} · ${mitWem(termin, ich, state.persons, t)}`}
              </span>
              <span className="klein-text">{`${tagKurz(termin.datum, state.lang)} · ${zeitSpanne(termin)} · ${t.trolleyOhneZusage}`}</span>
            </button>
            <span className="aufgaben-zeile-pfeil">
              <Zeichen name="weiter" />
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
