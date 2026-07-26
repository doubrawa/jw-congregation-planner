/*
 * Echtes Kalenderdatum einer Zusammenkunft aus dem ISO-Wochenstart plus dem
 * Wochentag-Versatz der jeweiligen Zusammenkunft. Bewusst dieselbe Logik wie
 * supabase/functions/send-reminders/index.ts (dort für die Erinnerungen), hier
 * für den Countdown-Chip der persönlichen Aufgaben.
 *
 * `week.start` ist der Montag der Woche (nur bei jw.org-importierten Wochen
 * gesetzt); Demo-/Vorlagen-Wochen haben keins → kein Countdown.
 */
import type { MeetingKey } from './types'

/** Wochentags-Kürzel → Tage nach Montag. */
const DAY_OFFSET: Record<string, number> = { Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6 }

/**
 * "Di 19:00 · So 10:00" → { mid, we } (Tage nach Montag). Ohne erkennbare
 * Wochentage gilt Dienstag (mid) / Sonntag (we) — wie serverseitig.
 */
export function meetingDayOffsets(meetingTimes: string): Record<MeetingKey, number> {
  const found = [...meetingTimes.matchAll(/\b(Mo|Di|Mi|Do|Fr|Sa|So)\b/g)].map((m) => DAY_OFFSET[m[1]])
  return { mid: found[0] ?? 1, we: found[1] ?? 6 }
}

/**
 * UTC-Zeitstempel (ms) des Zusammenkunftstags oder null, wenn die Woche kein
 * ISO-Startdatum hat oder es unlesbar ist. Auf Mitternacht UTC normalisiert —
 * der Countdown zählt ganze Kalendertage, keine Uhrzeiten.
 */
export function meetingDateMs(weekStartISO: string | undefined, offset: number): number | null {
  if (!weekStartISO) return null
  const start = Date.parse(weekStartISO)
  if (Number.isNaN(start)) return null
  return start + offset * 864e5
}
