import type { AppState } from '../app/context'
import { fsDate } from '../data/fs'
import { displayName } from '../data/helpers'
import { meetingDayOffsets } from '../data/meeting-dates'
import { deriveMyTasks, taskKeyWeek } from '../data/planning'
import type { Person } from '../data/types'

/**
 * Ein Eintrag der Zeitleiste im Personen-Detail. Die Texte bleiben kanonisch
 * deutsch — übersetzt wird erst bei der Anzeige (Zusammenkünfte über die
 * Programmsprache, der Treffpunkt-Ort über die App-Sprache).
 */
export type TimelineEntry = {
  key: string
  /**
   * Tage seit dem Montag der Woche 0. Ordnet Zusammenkünfte und Treffpunkte
   * ineinander — auch bei Demo-/Vorlagenwochen, die kein echtes Datum tragen.
   */
  tag: number
  /** Liegt vor der aktuellen Woche. */
  vergangen: boolean
} & (
  | { kind: 'meeting'; titel: string; datum: string }
  | { kind: 'fs'; datum: Date; zeit: string; ort: string }
)

/** Was die Zeitleiste aus dem Zustand braucht (erleichtert das Testen). */
export type TimelineDaten = Pick<
  AppState,
  'weeks' | 'services' | 'confirmations' | 'congregation' | 'fsWeeks' | 'fsBase'
>

/**
 * Alle Zuteilungen einer Person in zeitlicher Reihenfolge: Programmpunkte,
 * Ratgeber und Hilfsdienste der Zusammenkünfte (deriveMyTasks — dieselbe
 * Quelle wie „Meine Aufgaben") plus die geleiteten Treffpunkte.
 */
export function personTimeline(
  person: Person,
  state: TimelineDaten,
  heute = new Date(),
): TimelineEntry[] {
  const name = displayName(person)
  const offsets = meetingDayOffsets(state.congregation.meetings)
  // Vergangen wird am echten Kalendertag entschieden, nicht am `current`-Flag
  // der Woche — das wird nicht nachgeführt und veraltet (siehe fsBaseFromWeeks).
  const grenze = new Date(heute)
  grenze.setHours(0, 0, 0, 0)
  const istVergangen = (tag: number) => {
    const d = new Date(state.fsBase)
    d.setDate(d.getDate() + tag)
    return d < grenze
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
    if (!pos) continue
    const tag = pos.wi * 7 + offsets[pos.tab]
    entries.push({
      kind: 'meeting',
      key: task.id,
      tag,
      vergangen: istVergangen(tag),
      titel: task.title,
      datum: task.date,
    })
  }

  // Treffpunkte kennen keine Person-Id — dort trägt der Slot nur den Namen.
  state.fsWeeks.forEach((week, wi) => {
    for (const inst of week) {
      if (!inst.leader || inst.leader !== name) continue
      const tag = wi * 7 + ((inst.wd + 6) % 7) // wd: 0=So … 6=Sa → Tage nach Montag
      entries.push({
        kind: 'fs',
        key: `fs|${wi}|${inst.id}`,
        tag,
        vergangen: istVergangen(tag),
        datum: fsDate(state.fsBase, wi, inst.wd),
        zeit: inst.time,
        ort: inst.place,
      })
    }
  })

  // Stabil: bei gleichem Tag bleibt die Programmreihenfolge erhalten.
  return entries.sort((a, b) => a.tag - b.tag)
}
