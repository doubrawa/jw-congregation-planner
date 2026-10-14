// =============================================================================
// Der Montag einer Arbeitsheft-Woche — aus dem deutschen Seitennamen gelesen
// =============================================================================
// Reine Funktion (kein Deno/fetch), damit sie im Vitest-Test läuft; `index.ts`
// ruft beim Start `Deno.serve` und lässt sich deshalb nicht einbinden.
// =============================================================================

import { MONTHS } from './study.ts'

/**
 * Die drei Formen, in denen jw.org eine Woche im Seitennamen führt —
 * nachgemessen an den Ausgaben November/Dezember 2025 und 2026:
 *
 *   | Lage                  | Seitenname (ab „Zusammenkunft-")      |
 *   | --------------------- | ------------------------------------- |
 *   | in einem Monat        | `10-16-November-2025`                 |
 *   | über den Monatswechsel | `30-November-6-Dezember-2026`         |
 *   | über den Jahreswechsel | `28-Dezember-2026-3-Januar-2027`      |
 *
 * Jede trägt Tag, Monat und Jahr des **Montags** in den Gruppen 1 bis 3. Die
 * dritte Form kannte der Import bis zum 14.10.2026 nicht: Die Woche über den
 * Jahreswechsel fiel aus der Wochenliste, und ein Import nach dem 21. Dezember
 * sprang still zum 4. Januar.
 */
const FORMEN = [
  /^(\d+)-([A-Za-zäöü]+)-(\d{4})-\d+-[A-Za-zäöü]+-\d{4}/,
  /^(\d+)-([A-Za-zäöü]+)-\d+-[A-Za-zäöü]+-(\d{4})/,
  /^(\d+)-\d+-([A-Za-zäöü]+)-(\d{4})/,
]

/** Startdatum (UTC-Mitternacht des Montags) aus einem deutschen Wochen-Slug — `null`, wenn keiner passt. */
export function wochenStart(url: string): Date | null {
  let tail: string
  try {
    tail = decodeURIComponent((url.split('Zusammenkunft-')[1] ?? '').replace(/\/$/, ''))
  } catch {
    return null // kaputte Prozent-Folge: keine Woche, die sich lesen ließe
  }
  for (const form of FORMEN) {
    const m = form.exec(tail)
    const monat = m ? MONTHS[(m[2] ?? '').toLowerCase()] : undefined
    if (m && monat) return new Date(Date.UTC(Number(m[3]), monat - 1, Number(m[1])))
  }
  return null
}
