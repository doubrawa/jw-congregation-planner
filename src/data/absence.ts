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

import { isoDay, meetingDate } from './meeting-dates'
import type { Absence, MeetingKey, Week } from './types'

/** Schlüssel `<personId>|<wi>|<tab>` je Zusammenkunft, in der jemand fehlt. */
export type AbsenceSet = ReadonlySet<string>

/** Niemand ist abwesend — Vorgabe für Aufrufer ohne Abwesenheitsdaten (Tests). */
export const KEINE_ABWESENHEIT: AbsenceSet = new Set<string>()

const MEETINGS: MeetingKey[] = ['mid', 'we']

/**
 * Baut die Abwesenheits-Menge für die geladenen Wochen.
 *
 * `base` ist der Montag der Woche 0 (state.fsBase), `meetings` der eingestellte
 * Rhythmus („Di 19:00 · So 10:00") — beides nur nötig für Wochen ohne eigenes
 * Startdatum. Abwesenheiten ohne verknüpfte Person werden übergangen: sie
 * gehören zu einem Konto, das noch keiner Person zugeordnet ist, und lassen sich
 * niemandem im Programm zuordnen.
 */
export function buildAbsences(
  absences: readonly Absence[],
  weeks: readonly Week[],
  base: Date,
  meetings: string,
): AbsenceSet {
  const out = new Set<string>()
  if (absences.length === 0) return out
  // Wochentermine einmal vorab — sonst rechnet jede Abwesenheit sie erneut.
  const tage = weeks.map((week, wi) => ({
    mid: isoDay(meetingDate(week, wi, 'mid', base, meetings)),
    we: isoDay(meetingDate(week, wi, 'we', base, meetings)),
  }))
  for (const abwesenheit of absences) {
    const { personId, from, to } = abwesenheit
    if (!personId || !from || !to) continue
    tage.forEach((tag, wi) => {
      for (const tab of MEETINGS) {
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

/** Fehlt diese Person in dieser Woche — in mindestens einer Zusammenkunft? */
export function istWocheAbwesend(set: AbsenceSet, personId: string | undefined, wi: number): boolean {
  return MEETINGS.some((tab) => istAbwesend(set, personId, wi, tab))
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
