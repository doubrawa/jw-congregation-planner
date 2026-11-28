import { useId } from 'react'
import { useApp, useAppDispatch } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt } from '../bausteine/Punkt'
import { Zeichen } from '../bausteine/Zeichen'
import { fromIso } from '../data/meeting-dates'
import { LAGE_DER_ZUSAGE } from '../data/saal'
import { eigeneTermine } from '../data/trolleys'
import type { MyTask } from '../data/types'
import { aufgabenLabel, fill, useT, wortMitZahl } from '../i18n/useT'
import { mitWem, tagKurz, trolleyNameVon, zuDenTrolleys } from '../trolleys/trolley-anzeige'
import { Zeitspanne } from '../trolleys/Zeitspanne'
import { AufgabeKarte } from './AufgabeKarte'
import { AufgabeText, AufgabeWann } from './AufgabeText'
import { TauschAnfragen } from '../tauschen/TauschAnfragen'
import { ZusageStand } from './ZusageStand'
import './aufgaben.css'

/**
 * **Meine Aufgaben** (T121): alles, was ansteht — die nächste Aufgabe groß,
 * die übrigen je eine Zeile; „Alle bestätigen" für alles auf einmal; dann die
 * eigenen Trolley-Termine. Was man übernehmen kann (Einspringen, freie
 * Plätze), steht unter „Freie Plätze" (`FreiePlaetzeScreen`, T134), die
 * eigenen Abwesenheiten im Profil.
 *
 * **Jede Zeile sagt ihren Stand als Wort:** Was offen ist, trägt den Knopf
 * „Bestätigen"; danach steht dort „Bestätigt" mit Haken, nach einer Absage
 * „Verhindert". Ein Tipp irgendwo sonst in der Zeile öffnet die Aufgabe.
 */
export function AufgabenScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()

  const [naechste, ...weitere] = state.myTasks
  const zuBestaetigen = state.myTasks.filter((task) => task.status === 'offen').length

  return (
    <section className="screen aufgaben">
      <div className="aufgaben-kopf">
        <h1 className="seitentitel seitentitel--gross">{t.navAufgabenLong}</h1>
        {zuBestaetigen > 0 && (
          <div className="aufgaben-zusage">
            <span className="klein-text">{wortMitZahl(t.dashZuBest, zuBestaetigen)}</span>
            {zuBestaetigen > 1 && (
              <button type="button" className="knopf-pille" onClick={() => dispatch({ type: 'confirmAll' })}>
                {fill(t.alleNBestaetigen, { n: zuBestaetigen })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Anfragen zum Tauschen an mich (T153) — dorthin führt „Tausch angefragt". */}
      <TauschAnfragen />
      {naechste ? <AufgabeKarte task={naechste} /> : <p className="karte karte--held aufgaben-leer">{t.dashKeineAufgabe}</p>}

      {weitere.length > 0 && (
        <div className="karte aufgaben-liste">
          {weitere.map((task) => (
            <AufgabenZeile key={task.id} task={task} />
          ))}
        </div>
      )}

      <TrolleyTermine />
    </section>
  )
}

/**
 * **Eine eigene Aufgabe als Zeile:** oben, was es ist, daneben „Bestätigen"
 * oder der Stand als Wort; darunter über die ganze Breite, wann. Neben dem
 * Wort-Knopf bräche der Termin am Handy in drei Zeilen.
 *
 * Die ganze Zeile öffnet die Aufgabe (`.aufgaben-zeile-text::after`); der Knopf
 * dafür trägt den Titel und beschreibt sich mit dem Termin.
 */
function AufgabenZeile({ task }: { task: MyTask }) {
  const dispatch = useAppDispatch()
  const i18n = useT()
  const { t } = i18n
  const terminId = useId()
  return (
    <div className="aufgaben-zeile mit-termin">
      <Punkt art={LAGE_DER_ZUSAGE[task.status]} />
      <button
        type="button"
        className="aufgaben-zeile-text"
        aria-describedby={terminId}
        onClick={() => dispatch({ type: 'openMyTask', id: task.id })}
      >
        <span className="aufgaben-zeile-titel">
          <AufgabeText task={task} />
        </span>
      </button>
      {task.status === 'offen' ? (
        <button
          type="button"
          className="knopf-pille knopf-pille--akzent aufgaben-zeile-knopf"
          aria-label={`${aufgabenLabel(task, i18n)}: ${t.bestaetigen}`}
          onClick={() => dispatch({ type: 'confirmTask', id: task.id })}
        >
          {t.bestaetigen}
        </button>
      ) : (
        <span className="aufgaben-zeile-stand">
          <ZusageStand status={task.status} />
          <Zeichen name="weiter" />
        </span>
      )}
      <span id={terminId} className="wann-zeile aufgaben-zeile-termin">
        <AufgabeWann task={task} />
      </span>
    </div>
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
              <span className="wann-zeile">
                {tagKurz(termin.datum, state.lang)} · <Zeitspanne termin={termin} />
              </span>
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
