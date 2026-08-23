import { useApp } from '../app/context'
import type { Person } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { aufgabenLabel, useT } from '../i18n/useT'
import { personTimeline, type TimelineEntry } from './person-timeline'

/**
 * Zeitleiste einer Person (Personen-Detail, zwischen Stammdaten und
 * Aufgabenbereichen): je Eintrag Datum und Art, vergangene blasser.
 *
 * Sie führt **beide Richtungen** zusammen — wann jemand dran ist (Zuteilungen,
 * geleitete Treffpunkte) und wann er nicht kann (Abwesenheiten). Die
 * Abwesenheiten standen zuerst als eigene Liste unter dem Eingabeformular; dort
 * war nicht zu sehen, dass eine Zuteilung mitten in einen Zeitraum fällt. Jetzt
 * markieren zwei Punkte Beginn und Ende, und die Strecke dazwischen ist
 * eingefärbt: Was in diesen Abschnitt fällt, liegt sichtbar darin.
 *
 * Ohne jeden Eintrag bleibt die Karte ganz weg.
 */
export function PersonTimeline({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const entries = personTimeline(person, state)
  if (entries.length === 0) return null

  // Entfernen darf, wen es betrifft, oder ein Planer — dieselbe Grenze wie im
  // Eingabe-Formular (`AbsencePanel`) und in der Datenbank (`absences_write`).
  const darfBearbeiten = state.planner || person.id === state.personId

  // Einheitlich für alle Arten: Wochentag, Datum und — sofern hinterlegt —
  // die Uhrzeit („Dienstag, 8. September · 19:00"). Eine Abwesenheit hat keine.
  const wann = (e: TimelineEntry): string => {
    const tag = e.datum.toLocaleDateString(LOCALES[state.lang], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    return e.zeit ? `${tag} · ${e.zeit}` : tag
  }

  const beschriftung = (e: TimelineEntry): string => {
    if (e.kind === 'meeting') return aufgabenLabel({ title: e.titel, rolle: e.rolle }, i18n)
    if (e.kind === 'fs') return `${t.privTreffpunkt} · ${tu(e.ort)}`
    // Auch der letzte Tag zählt noch als abwesend (`von <= tag <= bis`) —
    // deshalb tragen beide Ränder dieselbe Beschriftung, und erst die Strecke
    // dazwischen macht daraus einen Zeitraum.
    return e.grund ? `${t.abwesendChip} · ${e.grund}` : t.abwesendChip
  }

  /** Ganze Namen, nie zusammengesetzt (siehe styles/klassennamen.test.ts). */
  const zeilenKlassen = (e: TimelineEntry, i: number): string => {
    const namen = ['pers-zeit-row']
    if (e.vergangen) namen.push('is-past')
    // Am oberen und unteren Rand gibt es keine Nachbarzeile — dort endet die
    // Leiste ohnehin am Punkt, eine Strecke ins Leere wäre ein Strich zu viel.
    if (e.abwOben && i > 0) namen.push('pers-zeit-row--abw-oben')
    if (e.abwUnten && i < entries.length - 1) namen.push('pers-zeit-row--abw-unten')
    return namen.join(' ')
  }

  return (
    <div className="panel panel--pb10" data-farbe="gold">
      <div className="panel-label pers-zeit-label">{t.zeitleiste}</div>
      <ol className="pers-zeit">
        {entries.map((e, i) => (
          <li key={e.key} className={zeilenKlassen(e, i)}>
            <span
              className={e.kind === 'abw' ? 'pers-zeit-dot pers-zeit-dot--abw' : 'pers-zeit-dot'}
              aria-hidden="true"
            />
            <div className="pers-zeit-datum">{wann(e)}</div>
            <div className="pers-zeit-art">{beschriftung(e)}</div>
            {/* Entfernt wird am Beginn, nicht an beiden Rändern: Es ist ein
                Eintrag, kein zweiter. */}
            {e.kind === 'abw' && e.rand !== 'ende' && darfBearbeiten && (
              <button
                type="button"
                className="pers-zeit-remove"
                aria-label={t.a11yRemove}
                onClick={() => dispatch({ type: 'removeAbsence', id: e.abwId })}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
