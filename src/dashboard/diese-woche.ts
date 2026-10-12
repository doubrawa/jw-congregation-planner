import { fsTag } from '../data/fs'
import { istAusgefallen, MEETING_TABS } from '../data/helpers'
import { currentWeekIndex, fromIso, isoVonKalendertag, kalendertagMs, meetingDateMs, meetingTime } from '../data/meeting-dates'
import type { FsInstance, MeetingKey, MeetingTimes, Week } from '../data/types'

/** Ein Termin der laufenden Woche: eine Zusammenkunft oder ein Treffpunkt. */
export type Termin = {
  key: string
  /** Der Kalendertag (örtlicher Mittag, wie `fromIso`). */
  tag: Date
  /** Uhrzeit „19:00". */
  zeit: string
} & ({ art: 'zusammenkunft'; tab: MeetingKey } | { art: 'treffpunkt'; inst: FsInstance })

/**
 * **Was diese Woche in der Versammlung ansteht** (T121) — die Zeilen unter der
 * eigenen Aufgabe auf dem Start: die Zusammenkünfte und die Treffpunkte, die
 * einen angehen — die der ganzen Versammlung und der eigenen Gruppen
 * (`eigeneGruppen`: die, in der man geführt ist, und die, die man leitet; so
 * zeigt sie auch der Predigtdienst).
 *
 * Nur, was noch kommt: Am Donnerstag interessiert der Dienstag nicht mehr.
 * Entfallenes (Kongress, T30) steht nicht da — es findet nicht statt.
 */
export function termineDieserWoche(
  weeks: readonly Week[],
  fsWeeks: readonly FsInstance[][],
  zeiten: MeetingTimes,
  gruppen: ReadonlySet<string>,
  heute = new Date(),
): Termin[] {
  const wi = currentWeekIndex(weeks, heute)
  const week = weeks[wi]
  if (!week) return []
  const ab = kalendertagMs(heute)
  const termine: Termin[] = []

  for (const tab of MEETING_TABS) {
    if (istAusgefallen(week, tab)) continue
    const ms = meetingDateMs(week, tab, zeiten)
    if (ms === null || ms < ab) continue
    // Als örtlicher Mittag wie die Treffpunkte (`fsTag`) — so vergleicht und
    // formatiert sich jeder Termin gleich.
    termine.push({ key: tab, tag: fromIso(isoVonKalendertag(ms)), zeit: meetingTime(week, tab, zeiten), art: 'zusammenkunft', tab })
  }

  for (const inst of fsWeeks[wi] ?? []) {
    if (inst.grp !== null && !gruppen.has(inst.grp)) continue
    const tag = fsTag(week.start, inst.wd)
    if (!tag || kalendertagMs(tag) < ab) continue
    termine.push({ key: `fs|${inst.id}`, tag, zeit: inst.time, art: 'treffpunkt', inst })
  }

  return termine.sort((a, b) => a.tag.getTime() - b.tag.getTime() || a.zeit.localeCompare(b.zeit))
}
