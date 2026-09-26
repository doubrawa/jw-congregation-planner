import { useEffect, useRef } from 'react'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { AbsencePanel } from '../components/AbsencePanel'
import { AufgabenAktionen } from '../components/AufgabenAktionen'
import { PushPrompt } from '../components/PushPrompt'
import { displayName } from '../data/helpers'
import { relativeDayLabel } from '../i18n/relative-time'
import { aufgabenLabel, aufgabenTp, fill, useT, zuteilungenText } from '../i18n/useT'
import './aufgaben.css'

/** Die Aktionen einer Aufgabe als Pillen — der Start zeigt sie kompakter. */
const AUF_KLASSEN = {
  bestaetigen: 'auf-confirm',
  bestaetigt: 'auf-badge auf-badge--best',
  verhindert: 'auf-badge auf-badge--verh',
  s89: 'auf-s89',
}

/**
 * Meine Aufgaben (Screen 4): nächste Aufgaben mit Bestätigungs-Status
 * (bestätigen / verhindert, S-89 anzeigen) und eigene Abwesenheiten. Das
 * Profil (Darstellung/Sprache/Abmelden) ist ein eigener Navigationspunkt.
 */
export function AufgabenScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const me = eigenePerson(state)

  /**
   * „Deine Einträge": seit die Abwesenheiten versammlungsweit geladen werden
   * (die Planung braucht sie), muss hier wieder auf die eigenen eingegrenzt
   * werden. Ohne Konto (Demo) gibt es nichts einzugrenzen.
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
  const einspringenRef = useRef<HTMLDivElement>(null)
  const gesucheOffen = state.substituteReqs.length > 0
  useEffect(() => {
    if (state.sprungZiel !== 'einspringen' || !gesucheOffen) return
    const bereich = einspringenRef.current
    if (!bereich) return
    bereich.scrollIntoView({ block: 'start' })
    bereich.querySelector<HTMLElement>('.panel-label')?.focus({ preventScroll: true })
    dispatch({ type: 'sprungZielErreicht' })
  }, [state.sprungZiel, gesucheOffen, dispatch])

  return (
    <section className="screen">
      <h1 className="screen-title">{t.navAufgabenLong}</h1>
      <p className="screen-subtitle">
        {me ? displayName(me) : ''} · {fill(t.congLabel, { name: state.congregation.name })}
      </p>

      <PushPrompt />

      <div className="panel panel--lead" data-farbe="acc">
        <h2 className="panel-label">{t.naechsteAufgaben}</h2>
        {state.myTasks.map((task) => (
          <div key={task.id} className="auf-row">
            <div>
              <button
                type="button"
                className="auf-open"
                onClick={() => dispatch({ type: 'openMyTask', id: task.id })}
              >
                <div className="auf-title">{aufgabenLabel(task, i18n)}</div>
                <div className="auf-date">{aufgabenTp(task, i18n)(task.date)}</div>
              </button>
              <div className="auf-actions">
                <AufgabenAktionen task={task} klassen={AUF_KLASSEN} />
              </div>
            </div>
            {(() => {
              // Live-Countdown aus dem Datum (Intl); ohne Datum kein Chip.
              const label = relativeDayLabel(task.at, state.lang)
              return label && <span className="auf-chip">{label}</span>
            })()}
          </div>
        ))}
      </div>

      {gesucheOffen && (
        <div ref={einspringenRef} className="panel panel--pb14 auf-sub" data-farbe="gold">
          {/* tabIndex -1: fokussierbar für den Sprung aus dem Push, ohne in die Tab-Reihenfolge zu geraten. */}
          <h2 className="panel-label" tabIndex={-1}>
            {t.einspringenTitle}
          </h2>
          <p className="panel-hint">{t.einspringenHint}</p>
          {state.substituteReqs.map((req) => (
            <div key={req.key} className="auf-sub-row">
              <div>
                <div className="auf-sub-title">{tu(req.title)}</div>
                <div className="auf-sub-meta">
                  {aufgabenTp(req, i18n)(req.date)} · {tu(req.declinedBy)}
                </div>
                {/* Was ich an dem Tag schon habe — vor dem Zusagen. */}
                {req.schonHeute.length > 0 && (
                  <div className="auf-sub-warn">
                    {t.sheetSchonHeute}: {zuteilungenText(req.schonHeute, i18n)}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="auf-sub-btn"
                onClick={() => dispatch({ type: 'takeSubstitute', key: req.key })}
              >
                {t.uebernehmen}
              </button>
            </div>
          ))}
        </div>
      )}

      <AbsencePanel personId={state.personId} entries={eigeneAbwesenheiten} listLabel={t.deineEintraege} />
    </section>
  )
}
