import { isoDay, montagNach, montagVon } from './meeting-dates'

/**
 * **Wie lange die App Vergangenes braucht — und behält** (T125, 16.10.2026).
 *
 * „Wir wollen ja keine Daten sammeln, die wir nicht brauchen" (Betreiber).
 * Zwei Fristen, beide ab dem Montag der laufenden Woche gezählt — „das muss
 * nicht tagesgenau sein":
 *
 * - **`VERTEILUNG_WOCHEN`** für die Wochen und alles, was zu ihnen gehört:
 *   Programm samt Zuteilungen, Treffpunkte, Zusagen, Versand-Tagebuch,
 *   Gruppenbesuche, vorgemerkte Vorträge, Weitere Pläne. Die gerechte
 *   Verteilung braucht ein Jahr — die Automatik fragt, wer am längsten wartet
 *   (`assignmentDistance` über alle geladenen Wochen), und manche Verkündiger
 *   haben nur alle paar Monate eine Zuteilung. Was an einer Woche hängt,
 *   bleibt so lange wie sie: Eine Woche ohne ihre Zusagen zeigte an jedem
 *   Platz „wartet auf Bestätigung".
 * - **`SONST_WOCHEN`** für alles andere: Mitteilungen, Erinnerungs-Tagebuch,
 *   Abwesenheiten samt Grund (ab ihrem Ende), Trolley-Termine, abgelaufene
 *   Anmelde-Links.
 *
 * Dieselben Zahlen gelten an drei Stellen: beim Laden (`lib/data.ts`), beim
 * Aufräumen in der Datenbank (`alte_daten_loeschen` in `supabase/schema.sql`;
 * `tests/aufbewahrung.test.ts` hält beide Seiten gleich) und bei den Importen
 * aus NWS und von jw.org (`scripts/`).
 */
export const VERTEILUNG_WOCHEN = 52
export const SONST_WOCHEN = 8

/**
 * Der Montag `wochen` Wochen vor dem Montag der laufenden Woche, als ISO-Datum.
 * Was davor liegt, ist abgelaufen: Die App lädt es nicht, die Datenbank räumt
 * es, kein Import holt es.
 */
export function aufbewahrtAb(wochen: number, heute: Date = new Date()): string {
  return montagNach(montagVon(isoDay(heute)), -wochen)
}
