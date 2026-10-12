import { useEffect, useRef } from 'react'
import { useApp } from '../app/context'
import { Punkt, type PunktArt } from '../bausteine/Punkt'
import { Zeichen } from '../bausteine/Zeichen'
import { AbsencePanel } from '../components/AbsencePanel'
import { PushPrompt } from '../components/PushPrompt'
import type { TaskStatus } from '../data/types'
import { aufgabenLabel, aufgabenTp, useT } from '../i18n/useT'
import { aufgabeWann } from './aufgabe-anzeige'
import { AngebotText, GesuchText } from './Angebot'
import { AufgabeKarte } from './AufgabeKarte'
import './aufgaben.css'

/** Der Punkt einer Aufgabe: wartet auf Zusage, zugesagt, abgesagt. */
const PUNKT_DER_ZUSAGE: Record<TaskStatus, PunktArt> = {
  offen: 'wartet',
  bestätigt: 'voll',
  verhindert: 'problem',
}

/**
 * **Meine Aufgaben** (T121): alles, was ansteht — die nächste Aufgabe groß,
 * die übrigen je eine Zeile mit einem Haken zum Bestätigen, „Alle bestätigen"
 * für alles auf einmal. Darunter, was man übernehmen kann: Ersatzgesuche
 * (Einspringen) und freie Plätze gesendeter Wochen.
 */
export function AufgabenScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n

  /*
   * „Deine Einträge": seit die Abwesenheiten versammlungsweit geladen werden
   * (die Planung braucht sie), muss hier wieder auf die eigenen eingegrenzt
   * werden. Ohne Konto (Entwicklerseite) gibt es nichts einzugrenzen.
   *
   * **Die Person entscheidet, nicht der Ersteller.** Wer eingetragen hat, ist
   * eine andere Frage als wen es betrifft — und seit es beides getrennt gibt
   * (Import ohne Konto, Planer trägt für andere ein), führt der Ersteller in die
   * Irre: Nach `userId === meiner` stünden dem Planer alle Abwesenheiten der
   * Versammlung unter „Deine Einträge". Der Ersteller trägt nur noch den Fall,
   * für den er gedacht war: ein Konto **ohne** eigene Person (`personId` null),
   * das seine Einträge sonst nicht wiederfände.
   */
  const eigeneAbwesenheiten = state.userId
    ? state.absences.filter((a) =>
        a.personId != null ? a.personId === state.personId : a.userId === state.userId,
      )
    : state.absences

  /*
   * **Ein Klick auf „Ersatz gesucht" landet hier beim Einspringen** (T109).
   *
   * Der Bereich steht unten und erst, wenn das Gesuch geladen ist — beim
   * Push-Klick kommen die Daten still hinterher. Deshalb wartet der Sprung auf
   * den Bereich statt auf den Screen: Steht er, wird hingescrollt und die
   * Überschrift fokussiert (ein Screenreader liest dort weiter, nicht oben),
   * und das Ziel ist erledigt. Kommt er nicht — das Gesuch war schon vergeben —,
   * bleibt die Seite oben; die nächste Navigation räumt das Ziel ab.
   */
  const einspringenRef = useRef<HTMLElement>(null)
  const gesucheOffen = state.substituteReqs.length > 0
  useEffect(() => {
    if (state.sprungZiel !== 'einspringen' || !gesucheOffen) return
    const bereich = einspringenRef.current
    if (!bereich) return
    bereich.scrollIntoView({ block: 'start' })
    bereich.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    dispatch({ type: 'sprungZielErreicht' })
  }, [state.sprungZiel, gesucheOffen, dispatch])

  const [naechste, ...weitere] = state.myTasks
  const zuBestaetigen = state.myTasks.filter((task) => task.status === 'offen').length

  return (
    <section className="screen aufgaben">
      <div className="aufgaben-kopf">
        <h1 className="seitentitel seitentitel--gross">{t.navAufgabenLong}</h1>
        {zuBestaetigen > 0 && (
          <div className="aufgaben-zusage">
            <span className="klein-text">{`${t.dashZuBest}: ${zuBestaetigen}`}</span>
            {zuBestaetigen > 1 && (
              <button type="button" className="knopf-pille" onClick={() => dispatch({ type: 'confirmAll' })}>
                {t.alleBestaetigen}
              </button>
            )}
          </div>
        )}
      </div>

      <PushPrompt />

      {naechste ? <AufgabeKarte task={naechste} /> : <p className="karte karte--held aufgaben-leer">{t.dashKeineAufgabe}</p>}

      {weitere.length > 0 && (
        <div className="karte aufgaben-liste">
          {weitere.map((task) => {
            const label = aufgabenLabel(task, i18n)
            return (
              <div key={task.id} className="aufgaben-zeile">
                <Punkt art={PUNKT_DER_ZUSAGE[task.status]} />
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

      {gesucheOffen && (
        <section ref={einspringenRef} className="aufgaben-abschnitt" data-bereich="einspringen">
          {/* tabIndex -1: fokussierbar für den Sprung aus dem Push, ohne in die Tab-Reihenfolge zu geraten. */}
          <h2 className="abschnitt-titel" tabIndex={-1}>
            {t.einspringenTitle}
          </h2>
          <div className="karte aufgaben-angebote">
            <p className="klein-text">{t.einspringenHint}</p>
            {state.substituteReqs.map((req) => (
              <div key={req.key} className="aufgaben-angebot">
                <div className="aufgaben-angebot-text">
                  <Punkt art="problem" />
                  <GesuchText req={req} />
                </div>
                <button type="button" className="knopf-dunkel" onClick={() => dispatch({ type: 'takeSubstitute', key: req.key })}>
                  {t.uebernehmen}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/*
        Freie Plätze (4.10.2026): unbesetzte Plätze gesendeter Wochen, für die
        ich den Aufgabenbereich habe. Der Tipp trägt direkt ein
        (`platzUebernehmen` → Edge Function).
      */}
      {state.offenePlaetze.length > 0 && (
        <section className="aufgaben-abschnitt" data-bereich="freie-plaetze">
          <h2 className="abschnitt-titel">{t.freiePlaetzeTitle}</h2>
          <div className="karte aufgaben-angebote">
            <p className="klein-text">{t.freiePlaetzeHint}</p>
            {state.offenePlaetze.map((platz) => (
              <div key={platz.key} className="aufgaben-zeile">
                <Punkt art="offen" />
                <AngebotText
                  titel={aufgabenLabel(platz, i18n)}
                  wann={aufgabenTp(platz, i18n)(platz.date)}
                  schonHeute={platz.schonHeute}
                />
                <button type="button" className="knopf-pille" onClick={() => dispatch({ type: 'platzUebernehmen', key: platz.key })}>
                  {t.uebernehmen}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <AbsencePanel personId={state.personId} entries={eigeneAbwesenheiten} listLabel={t.deineEintraege} />
    </section>
  )
}
