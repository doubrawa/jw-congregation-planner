import { useMemo } from 'react'
import { useApp } from '../app/context'
import { Zeitleiste, type ZeitZeile } from '../components/Zeitleiste'
import { abwesenheitsArt, zeitleisteDatum } from '../components/zeitleiste-gemeinsam'
import type { Person } from '../data/types'
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
 * Gezeichnet wird sie von `Zeitleiste` — derselben Leiste, die auf dem Start
 * die eigenen Aufgaben der nächsten zwei Wochen zeigt. Hier steht, **was**
 * daraufsteht: alle Einträge dieser Person, ohne Zeitfenster.
 *
 * Ohne jeden Eintrag bleibt die Karte ganz weg.
 */
export function PersonTimeline({ person }: { person: Person }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  /*
   * Gemerkt: `personTimeline` läuft über **alle** geladenen Wochen (bis zu 52,
   * zwei Zusammenkünfte je Woche). Die Karte steht mitten im Personen-Formular,
   * und das löst je Tastenanschlag aus — ein zwölfbuchstabiger Nachname kostete
   * so zwölf volle Durchläufe.
   */
  const entries = useMemo(
    () => personTimeline(person, state),
    [person, state],
  )

  // Entfernen darf, wen es betrifft, oder ein Planer — dieselbe Grenze wie im
  // Eingabe-Formular (`AbsencePanel`) und in der Datenbank (`absences_write`).
  const darfBearbeiten = state.planner || person.id === state.personId

  const beschriftung = (e: TimelineEntry): string => {
    if (e.kind === 'meeting') return aufgabenLabel({ title: e.titel, rolle: e.rolle }, i18n)
    if (e.kind === 'fs') return `${t.privTreffpunkt} · ${tu(e.ort)}`
    return abwesenheitsArt(e.grund, t.abwesendChip)
  }

  const zeilen: ZeitZeile[] = entries.map((e) => ({
    key: e.key,
    wann: zeitleisteDatum(e.datum, state.lang, e.zeit),
    art: beschriftung(e),
    abw: e.kind === 'abw',
    ...(e.abwOben ? { abwOben: true } : {}),
    ...(e.abwUnten ? { abwUnten: true } : {}),
    vergangen: e.vergangen,
    // Entfernt wird am Beginn, nicht an beiden Rändern: Es ist ein Eintrag,
    // kein zweiter.
    ...(e.kind === 'abw' && e.rand !== 'ende' && darfBearbeiten
      ? {
          ende: (
            <button
              type="button"
              className="zeit-remove"
              aria-label={t.a11yRemove}
              onClick={() => dispatch({ type: 'removeAbsence', id: e.abwId })}
            >
              ✕
            </button>
          ),
        }
      : {}),
  }))

  return <Zeitleiste label={t.zeitleiste} farbe="gold" zeilen={zeilen} />
}
