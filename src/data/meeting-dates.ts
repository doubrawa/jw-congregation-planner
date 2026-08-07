/*
 * Echtes Kalenderdatum einer Zusammenkunft aus dem ISO-Wochenstart plus dem
 * Wochentag-Versatz der jeweiligen Zusammenkunft. Bewusst dieselbe Logik wie
 * supabase/functions/send-reminders/index.ts (dort für die Erinnerungen), hier
 * für den Countdown-Chip der persönlichen Aufgaben.
 *
 * `week.start` ist der Montag der Woche (nur bei jw.org-importierten Wochen
 * gesetzt); Demo-/Vorlagen-Wochen haben keins → kein Countdown.
 */
import type { MeetingKey, Week } from './types'

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

/** Erste Uhrzeit in einem Text, auf "HH:MM" normiert. */
function ersteZeit(text: string): string | undefined {
  const m = /\b(\d{1,2})[:.](\d{2})\b/.exec(text)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined
}

/**
 * "Di 19:00 · So 10:00" → { mid: "19:00", we: "10:00" }. Ohne erkennbare
 * Uhrzeit bleibt der jeweilige Wert leer — der Aufrufer lässt sie dann weg.
 * Die Zusammenkunfts-Zeiten stehen nur hier (in den Einstellungen); die
 * importierten Wochen tragen im `date`-Feld die Wochenspanne, keinen Termin.
 */
export function meetingTimesOf(meetingTimes: string): Record<MeetingKey, string> {
  const found = [...meetingTimes.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)].map(
    (m) => `${m[1].padStart(2, '0')}:${m[2]}`,
  )
  return { mid: found[0] ?? '', we: found[1] ?? '' }
}

/** Ausgeschriebener Wochentag (Wochendaten sind kanonisch deutsch) → Tage nach Montag. */
const WEEKDAY_OFFSET: Record<string, number> = {
  Montag: 0, Dienstag: 1, Mittwoch: 2, Donnerstag: 3,
  Freitag: 4, Samstag: 5, Sonnabend: 5, Sonntag: 6,
}

/**
 * Termin aus dem `date`-Feld einer Zusammenkunft, soweit es einen trägt:
 * "Samstag, 3. Oktober · 19:30 · Königreichssaal" → { offset: 5, zeit: "19:30" }.
 *
 * Wichtig für Wochen, die vom Rhythmus abweichen (Gedächtnismahl, Kongress) —
 * dort steht der echte Termin nur hier. Importierte Wochen tragen dagegen die
 * Wochenspanne ("7.–13. September"): kein Wochentag, keine Zeit → beides
 * `undefined`, und der Aufrufer nimmt die Zeiten aus den Einstellungen.
 */
export function meetingDateParts(date: string): { offset?: number; zeit?: string } {
  const tag = /\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonnabend|Sonntag)\b/.exec(date)
  return { offset: tag ? WEEKDAY_OFFSET[tag[1]] : undefined, zeit: ersteZeit(date) }
}

/** Datum als lokales ISO („2026-09-08") — nicht über toISOString, das ist UTC. */
export function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const t = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${t}`
}

/** ISO-Datum → lokaler Mittag (kein Tagesversatz durch Zeitzonen). */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

/**
 * Kalendertag einer Zusammenkunft. Drei Quellen, in dieser Reihenfolge:
 *  1. ein eigener Termin im `date`-Feld der Woche (Gedächtnismahl, Kongress),
 *  2. das ISO-Startdatum der Woche (jw.org-Import) plus Wochentag-Versatz,
 *  3. der Montag der Woche 0 (`base`) plus `wi` Wochen plus Wochentag-Versatz —
 *     für Demo- und Vorlagenwochen, die kein Startdatum tragen.
 *
 * Einzige Stelle, an der aus „Woche + Zusammenkunft" ein Datum wird; Zeitleiste,
 * Abwesenheiten und Anzeige müssen sich sonst nie einig sein.
 */
export function meetingDate(
  week: Week,
  wi: number,
  tab: MeetingKey,
  base: Date,
  meetings: string,
): Date {
  const eigener = meetingDateParts(week[tab].date)
  const offset = eigener.offset ?? meetingDayOffsets(meetings)[tab]
  const montag = week.start ? fromIso(week.start) : new Date(base)
  const tag = new Date(montag)
  tag.setDate(tag.getDate() + (week.start ? 0 : wi * 7) + offset)
  return tag
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
