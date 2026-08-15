import type { AppState } from '../app/context'
import { displayName } from '../data/helpers'
import { meetingDate, meetingTime, tageZwischen } from '../data/meeting-dates'
import { aufgabenBezeichnung, deriveMyTasks, taskKeyWeek, wochenIndex } from '../data/planning'
import type { Person } from '../data/types'

/**
 * Ein Eintrag der Zeitleiste im Personen-Detail — für beide Arten gleich
 * aufgebaut: echtes Datum plus Uhrzeit. Die Beschriftung bleibt kanonisch
 * deutsch und wird erst bei der Anzeige übersetzt.
 */
export type TimelineEntry = {
  key: string
  /**
   * Tage seit dem Montag der Woche 0. Ordnet Zusammenkünfte und Treffpunkte
   * ineinander — auch bei Demo-/Vorlagenwochen, die kein echtes Datum tragen.
   */
  tag: number
  /** Kalendertag der Aufgabe. */
  datum: Date
  /** "19:00"; leer, wenn die Versammlung keine Zeit hinterlegt hat. */
  zeit: string
  /** Liegt vor dem heutigen Tag. */
  vergangen: boolean
} & ({ kind: 'meeting'; titel: string } | { kind: 'fs'; ort: string })

/** Was die Zeitleiste aus dem Zustand braucht (erleichtert das Testen). */
export type TimelineDaten = Pick<
  AppState,
  'weeks' | 'services' | 'confirmations' | 'congregation' | 'fsWeeks' | 'fsBase'
>

/**
 * Alle Zuteilungen einer Person in zeitlicher Reihenfolge: Programmpunkte,
 * Ratgeber und Hilfsdienste der Zusammenkünfte (deriveMyTasks — dieselbe
 * Quelle wie „Meine Aufgaben") plus die geleiteten Treffpunkte.
 *
 * Datum und Uhrzeit werden gerechnet: importierte Wochen tragen im `date`-Feld
 * nur die Wochenspanne („7.–13. September"). Der Tag ergibt sich aus dem Montag
 * der Woche plus dem in den Einstellungen festgelegten Wochentag, die Uhrzeit
 * ebenso — außer die Woche nennt einen eigenen Termin (Gedächtnismahl).
 */
export function personTimeline(
  person: Person,
  state: TimelineDaten,
  heute = new Date(),
): TimelineEntry[] {
  const name = displayName(person)
  // Vergangen wird am echten Kalendertag entschieden, nicht am `current`-Flag
  // der Woche — das wird nicht nachgeführt und veraltet (siehe fsBaseFromWeeks).
  const grenze = new Date(heute)
  grenze.setHours(0, 0, 0, 0)
  /** Kalendertag zu „Tage nach dem Montag der Woche 0". */
  const datumVon = (tag: number) => {
    const d = new Date(state.fsBase)
    d.setDate(d.getDate() + tag)
    return d
  }
  const entries: TimelineEntry[] = []

  const tasks = deriveMyTasks(
    state.weeks,
    state.services,
    name,
    state.confirmations,
    state.congregation.meetings,
    person.id,
  )
  for (const task of tasks) {
    const pos = taskKeyWeek(task.id)
    const wi = pos ? wochenIndex(state.weeks, pos.woche) : -1
    const week = wi >= 0 ? state.weeks[wi] : undefined
    if (!pos || !week) continue
    // Tag und Uhrzeit kommen aus meeting-dates.ts — derselben Quelle wie
    // Countdown, Erinnerung und Abwesenheitsprüfung. Die Zeitleiste hatte
    // dafür eine eigene Rechnung, was bei abweichenden Terminen auseinanderlief.
    const datum = meetingDate(week, wi, pos.tab, state.fsBase, state.congregation.meetings)
    entries.push({
      kind: 'meeting',
      key: task.id,
      // Sortierschlüssel bleibt „Tage seit dem Montag der Woche 0", damit sich
      // Zusammenkünfte und Treffpunkte ineinander einordnen.
      tag: tageZwischen(state.fsBase, datum),
      datum,
      zeit: meetingTime(week, pos.tab, state.congregation.meetings),
      vergangen: datum < grenze,
      titel: aufgabenBezeichnung(task),
    })
  }

  // Über die Person-Id, mit Rückfall auf den Namen für Altdaten — dieselbe
  // Rangfolge wie bei den Zusammenkunfts-Aufgaben. Vorher trug ein Treffpunkt
  // nur den Namen; Namensgleiche sahen dadurch gegenseitig ihre Leitungen.
  state.fsWeeks.forEach((week, wi) => {
    for (const inst of week) {
      if (!inst.leader) continue
      if (!(inst.lpid ? inst.lpid === person.id : inst.leader === name)) continue
      const tag = wi * 7 + ((inst.wd + 6) % 7) // wd: 0=So … 6=Sa → Tage nach Montag
      const datum = datumVon(tag)
      entries.push({
        kind: 'fs',
        key: `fs|${wi}|${inst.id}`,
        tag,
        datum,
        zeit: inst.time,
        vergangen: datum < grenze,
        ort: inst.place,
      })
    }
  })

  // Stabil: bei gleichem Tag bleibt die Programmreihenfolge erhalten.
  return entries.sort((a, b) => a.tag - b.tag)
}
