/**
 * Abwesenheiten — wer ist wann nicht da?
 *
 * Gespeichert wird ein Zeitraum von Datum bis Datum (Tabelle `absences`), nicht
 * ein Wochenindex. Der Index war zweimal falsch: er verschiebt sich, sobald die
 * geladenen Wochen nicht mehr bei null beginnen, und er kannte keine Tage — wer
 * nur am Wochenende weg war, galt die ganze Woche als abwesend.
 *
 * Für die Planung wird daraus einmalig eine Menge von Schlüsseln
 * `<personId>|<wi>|<tab>` gebaut: das ist die Form, in der Auto-Zuteilung,
 * Konfliktprüfung und Zuteilungs-Sheet fragen. Die Indizes darin sind rein
 * abgeleitet und werden nie gespeichert.
 */

import { MEETING_TABS } from './helpers'
import { isoDay, meetingDate } from './meeting-dates'
import type { Absence, MeetingKey, MeetingTimes, Week } from './types'

/** Schlüssel `<personId>|<wi>|<tab>` je Zusammenkunft, in der jemand fehlt. */
export type AbsenceSet = ReadonlySet<string>

/** Niemand ist abwesend — Vorgabe für Aufrufer ohne Abwesenheitsdaten (Tests). */
export const KEINE_ABWESENHEIT: AbsenceSet = new Set<string>()


/**
 * Baut die Abwesenheits-Menge für die geladenen Wochen.
 *
 * `zeiten` ist der eingestellte Rhythmus („Di 19:00 · So 10:00"), aus dem mit
 * dem Montag der Woche der Tag jeder Zusammenkunft wird (`meetingDate`).
 * Abwesenheiten ohne verknüpfte Person werden übergangen: sie gehören zu einem
 * Konto, das noch keiner Person zugeordnet ist, und lassen sich niemandem im
 * Programm zuordnen.
 */
export function buildAbsences(
  absences: readonly Absence[],
  weeks: readonly Week[],
  zeiten: MeetingTimes,
): AbsenceSet {
  const out = new Set<string>()
  if (absences.length === 0) return out
  // Wochentermine einmal vorab — sonst rechnet jede Abwesenheit sie erneut.
  const tage = weeks.map((week) => ({
    mid: isoDay(meetingDate(week, 'mid', zeiten)),
    we: isoDay(meetingDate(week, 'we', zeiten)),
  }))
  for (const abwesenheit of absences) {
    const { personId, from, to } = abwesenheit
    if (!personId || !from || !to) continue
    tage.forEach((tag, wi) => {
      for (const tab of MEETING_TABS) {
        if (tag[tab] >= from && tag[tab] <= to) out.add(`${personId}|${wi}|${tab}`)
      }
    })
  }
  return out
}

/** Fehlt diese Person in dieser Zusammenkunft? */
export function istAbwesend(
  set: AbsenceSet,
  personId: string | undefined,
  wi: number,
  tab: MeetingKey,
): boolean {
  return personId != null && set.has(`${personId}|${wi}|${tab}`)
}

/**
 * Fehlt diese Person an einem bestimmten Tag? Für Termine, die nicht an einer
 * Zusammenkunft hängen — die Treffpunkte haben ihren eigenen Wochentag.
 */
export function istAbwesendAm(
  absences: readonly Absence[],
  personId: string | undefined,
  tag: Date,
): boolean {
  if (!personId) return false
  const iso = isoDay(tag)
  return absences.some((a) => a.personId === personId && a.from <= iso && iso <= a.to)
}
