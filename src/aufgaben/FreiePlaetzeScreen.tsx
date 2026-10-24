import { useEffect, useRef } from 'react'
import { useApp } from '../app/context'
import { Punkt } from '../bausteine/Punkt'
import { aufgabenLabel, aufgabenTermin, useT } from '../i18n/useT'
import { AngebotText, GesuchText } from './Angebot'
import './aufgaben.css'

/**
 * **Freie Plätze** (T134): was man übernehmen kann, als eigener Menüpunkt unter
 * „Meine Aufgaben" — oben die Ersatzgesuche (Einspringen), darunter die Plätze
 * gesendeter Wochen, für die noch niemand eingeteilt ist. Bis zum 24.10.2026
 * standen beide unten auf „Meine Aufgaben"; Betreiber: Getauscht wird oft, bisher
 * über eine WhatsApp-Gruppe — in der App soll man schneller sehen, was gesucht
 * wird.
 */
export function FreiePlaetzeScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n

  /*
   * **Ein Klick auf „Ersatz gesucht" landet hier beim Einspringen** (T109).
   *
   * Beim Push-Klick kommen die Daten still hinterher. Deshalb wartet der Sprung
   * auf den Bereich statt auf den Screen: Steht er, wird hingescrollt und die
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

  return (
    <section className="screen aufgaben">
      <div className="aufgaben-kopf">
        <h1 className="seitentitel seitentitel--gross">{t.freiePlaetzeTitle}</h1>
      </div>

      {!gesucheOffen && state.offenePlaetze.length === 0 && <p className="karte aufgaben-leer">{t.freiePlaetzeLeer}</p>}

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
          <h2 className="abschnitt-titel">{t.freiePlaetzeNochFrei}</h2>
          <div className="karte aufgaben-angebote">
            <p className="klein-text">{t.freiePlaetzeHint}</p>
            {state.offenePlaetze.map((platz) => (
              <div key={platz.key} className="aufgaben-zeile">
                <Punkt art="offen" />
                <AngebotText
                  titel={aufgabenLabel(platz, i18n)}
                  wann={aufgabenTermin(platz, i18n)}
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
    </section>
  )
}
