import { useState, type FormEvent } from 'react'
import { useApp } from '../app/context'
import { DatePicker } from './DatePicker'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'
import type { Absence } from '../data/types'
// Die `.abs-*`-Regeln stehen dort, wo die Karte herkommt. Ausdrücklich
// eingebunden, statt sich darauf zu verlassen, dass der Aufgaben-Screen sie
// schon geladen hat — die Karte steht inzwischen auch im Personen-Detail.
import '../aufgaben/aufgaben.css'

/**
 * Abwesenheiten einer Person: eintragen, auflisten, entfernen.
 *
 * **Zwei Orte, eine Karte.** Im persönlichen Bereich („Meine Aufgaben") pflegt
 * jeder seine eigenen; im Personen-Detail trägt der Planer sie für andere ein —
 * etwa nach einem Anruf („wir sind im Oktober weg"), denn die meisten
 * Verkündiger haben gar kein Konto. Beides ist derselbe Vorgang, und was hier
 * einmal steht, kann an der zweiten Stelle nicht anders sein: Die Prüfung
 * „Von vor Bis" und die Vorbelegung des Bis-Datums sind genau die Sorte Regel,
 * die beim zweiten Abschreiben verloren geht.
 *
 * `personId` ist die **betroffene** Person (null = Konto ohne Person; dann
 * zählt die Abwesenheit für die Planung nicht, siehe `Absence`). Der Ersteller
 * bleibt daneben das angemeldete Konto — wer eingetragen hat, ist eine andere
 * Frage als wen es betrifft.
 */
export function AbsencePanel({
  personId,
  entries,
  listLabel,
  showList = true,
}: {
  personId: string | null
  entries: readonly Absence[]
  listLabel: string
  /**
   * Liste unter dem Formular zeigen. Im Personen-Detail **nicht**: Dort stehen
   * die Zeiträume in der Zeitleiste, mit Beginn und Ende als eigene Punkte —
   * zweimal dasselbe untereinander wäre nur eine zweite Wahrheit.
   */
  showList?: boolean
}) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  const fmtDate = (iso: string): string => {
    if (!iso) return ''
    // Mittag, nicht Mitternacht: sonst schiebt die Zeitzone das Datum um einen Tag.
    const date = new Date(`${iso}T12:00:00`)
    return date.toLocaleDateString(LOCALES[state.lang], { day: 'numeric', month: 'long' })
  }

  /**
   * Eintragen darf, wen es selbst betrifft — oder ein Planer. Dieselbe Grenze
   * zieht die Datenbank (`absences_write`: eigener Eintrag, eigene Person oder
   * Planer); stünde das Formular auch anderen offen, schriebe es ins Leere und
   * die Zeile verschwände beim nächsten Laden wieder.
   */
  const darfBearbeiten = state.planner || personId === state.personId

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!from || !to) {
      dispatch({ type: 'showToast', text: t.toastVonBis })
      return
    }
    if (from > to) {
      dispatch({ type: 'showToast', text: t.toastVonNachBis })
      return
    }
    dispatch({
      type: 'addAbsence',
      // personId verknüpft die Abwesenheit mit dem Programm — ohne sie weiß die
      // Planung nicht, wer fehlt. userId bleibt der Ersteller (siehe Absence).
      absence: { id: crypto.randomUUID(), personId, userId: state.userId, from, to, reason },
    })
    setFrom('')
    setTo('')
    setReason('')
  }

  return (
    <form className="panel panel--pb16" data-farbe="neutral" onSubmit={add}>
      <h2 className="panel-label">{t.abwesenheiten}</h2>

      {darfBearbeiten && (
        <>
          <div className="abs-form-row">
            <div className="abs-field">
              <span className="field-label">{t.von}</span>
              <DatePicker
                value={from}
                onChange={(iso) => {
                  setFrom(iso)
                  // "Bis" mit demselben Tag vorbelegen → Ein-Tages-Abwesenheit
                  // ist ein einziger Klick; korrigiert auch ein Bis vor dem Von.
                  if (iso && (!to || to < iso)) setTo(iso)
                }}
                locale={LOCALES[state.lang]}
                placeholder={t.datumPh}
                ariaLabel={t.von}
                prevLabel={t.a11yPrevMonth}
                nextLabel={t.a11yNextMonth}
              />
            </div>
            <div className="abs-field">
              <span className="field-label">{t.bis}</span>
              <DatePicker
                value={to}
                onChange={setTo}
                locale={LOCALES[state.lang]}
                min={from || undefined}
                placeholder={t.datumPh}
                ariaLabel={t.bis}
                prevLabel={t.a11yPrevMonth}
                nextLabel={t.a11yNextMonth}
              />
            </div>
          </div>
          <div className="abs-reason">
            <label className="field-label" htmlFor={`abs-reason-${personId ?? 'ich'}`}>
              {t.grundOpt}
            </label>
            <input
              id={`abs-reason-${personId ?? 'ich'}`}
              className="field-input"
              type="text"
              placeholder={t.grundPh}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-outline abs-submit">
            {t.abwEintragen}
          </button>
        </>
      )}

      {showList && <div className="panel-label auf-entries-label">{listLabel}</div>}
      {showList && entries.map((absence) => (
        <div key={absence.id} className="abs-row">
          <div>
            <div className="abs-range">
              {fmtDate(absence.from)} – {fmtDate(absence.to)}
            </div>
            <div className="abs-reason-text">{absence.reason || t.ohneAngabe}</div>
          </div>
          {darfBearbeiten && (
            <button
              type="button"
              className="abs-remove"
              aria-label={t.a11yRemove}
              onClick={() => dispatch({ type: 'removeAbsence', id: absence.id })}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {showList && entries.length === 0 && <p className="abs-empty">{t.keineAbw}</p>}
    </form>
  )
}
