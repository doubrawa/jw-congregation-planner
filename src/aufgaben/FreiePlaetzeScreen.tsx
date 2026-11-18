import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { Punkt, type PunktArt } from '../bausteine/Punkt'
import { useT } from '../i18n/useT'
import { AngebotText, GesuchText } from './Angebot'
import { AufgabeTermin, AufgabeText } from './AufgabeText'
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
  const { t } = useT()

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
              <AngebotZeile
                key={req.key}
                punkt="problem"
                text={(id) => <GesuchText req={req} id={id} />}
                onUebernehmen={() => dispatch({ type: 'openUebernehmen', auswahl: { art: 'gesuch', key: req.key } })}
              />
            ))}
          </div>
        </section>
      )}

      {/*
        Freie Plätze (4.10.2026): unbesetzte Plätze gesendeter Wochen, für die
        ich den Aufgabenbereich habe. Eingetragen wird erst im Blatt
        „Übernehmen?" (`platzUebernehmen` → Edge Function).
      */}
      {state.offenePlaetze.length > 0 && (
        <section className="aufgaben-abschnitt" data-bereich="freie-plaetze">
          <h2 className="abschnitt-titel">{t.freiePlaetzeNochFrei}</h2>
          <div className="karte aufgaben-angebote">
            <p className="klein-text">{t.freiePlaetzeHint}</p>
            {state.offenePlaetze.map((platz) => (
              <AngebotZeile
                key={platz.key}
                punkt="offen"
                text={(id) => (
                  <AngebotText id={id} titel={<AufgabeText task={platz} />} wann={<AufgabeTermin task={platz} />} schonHeute={platz.schonHeute} />
                )}
                onUebernehmen={() => dispatch({ type: 'openUebernehmen', auswahl: { art: 'platz', key: platz.key } })}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

/**
 * Eine Zeile zum Übernehmen — Ersatzgesuch wie freier Platz in derselben Form,
 * die Pille rechts. Der Knopf heißt, was er tut („Übernehmen"); was er
 * übernimmt, liest ein Vorleseprogramm aus der Zeile (`aria-describedby`).
 */
function AngebotZeile({
  punkt,
  text,
  onUebernehmen,
}: {
  punkt: PunktArt
  text: (id: string) => ReactNode
  onUebernehmen: () => void
}) {
  const { t } = useT()
  const id = useId()
  return (
    <div className="aufgaben-zeile">
      <Punkt art={punkt} />
      {text(id)}
      <button type="button" className="knopf-pille" aria-describedby={id} onClick={onUebernehmen}>
        {t.uebernehmen}
      </button>
    </div>
  )
}
