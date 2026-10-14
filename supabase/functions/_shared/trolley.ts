// =============================================================================
// Geteilt: Trolley-Termine (T121, Phase 7)
// =============================================================================
// „Man steht mit dem Trolley ja nur 15 Minuten an einem Platz … was man
// eigentlich braucht, ist ein Terminplan, wo man sich verabreden kann" (der
// Betreiber, 11.10.2026). Die Versammlung legt ihre Trolleys an; wer das
// Trolley-Recht hat, trägt sich ein — einer trägt beide ein, oder einer allein
// mit „Partner gesucht", und jemand kommt dazu. Niemand plant, niemand sagt zu.
//
// Hier steht, was die App und die Function `trolley` gleich rechnen müssen: das
// Raster der Zeiten, wann sich zwei Termine überschneiden, wer nach dem
// Austragen bleibt, und der Rumpf der Mitteilungen. Die Datenbank prüft die
// Überschneidung ein drittes Mal (`trolley_termin_pruefen`) — dort unter
// Sperre, damit zwei, die gleichzeitig dieselbe Zeit wollen, nicht beide
// durchkommen.
// =============================================================================

import { alsFreitext } from './i18n/freitext.ts'
import { deutschesDatum } from './planung.ts'

/** Die erste und die letzte wählbare Zeit — frei von 6 bis 22 Uhr. */
export const TROLLEY_ERSTE = '06:00'
export const TROLLEY_LETZTE = '22:00'

/** Die wählbaren Zeiten, in halben Stunden: „06:00", „06:30" … „22:00". */
export const TROLLEY_ZEITEN: readonly string[] = Array.from({ length: (22 - 6) * 2 + 1 }, (_, i) => {
  const minuten = 6 * 60 + i * 30
  return `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${minuten % 60 ? '30' : '00'}`
})

/**
 * Taugt dieser Zeitraum für einen Termin? Beide Zeiten aus dem Raster, das
 * Ende nach dem Anfang. Verglichen wird als Text — „HH:MM" sortiert wie die
 * Uhr.
 */
export function zeitraumGueltig(von: string, bis: string): boolean {
  return TROLLEY_ZEITEN.includes(von) && TROLLEY_ZEITEN.includes(bis) && von < bis
}

/** Was eine Überschneidung braucht: der Tag (ISO) und die Zeiten. */
export interface TrolleyZeitraum {
  datum: string
  von: string
  bis: string
}

/**
 * **Überschneiden sich zwei Termine?** Am selben Tag, und einer beginnt, bevor
 * der andere endet. Wer um 11:00 übernimmt, wo einer um 11:00 aufhört, stört
 * niemanden — die Grenze gehört keinem von beiden.
 */
export function ueberschneiden(a: TrolleyZeitraum, b: TrolleyZeitraum): boolean {
  return a.datum === b.datum && a.von < b.bis && b.von < a.bis
}

/**
 * **Wer nach dem Austragen bleibt** — die eine Regel für App und Function.
 *
 * Geht einer von zweien, bleibt der andere, und für ihn heißt es wieder
 * „Partner gesucht": Er hat sich verabredet und soll den Termin nicht
 * verlieren, nur weil der andere nicht kann. Geht der Letzte, ist der Termin
 * weg (`null`). Wer gar nicht dabei ist, ändert nichts (`undefined`).
 */
export function wasBleibt(person: string, partner: string | null, wer: string): { person: string } | null | undefined {
  if (wer === partner) return { person }
  if (wer !== person) return undefined
  return partner ? { person: partner } : null
}

/** Was im Rumpf einer Trolley-Mitteilung steht. */
export interface TrolleyRumpf {
  /** Der Name des Trolleys, wie die Versammlung ihn angelegt hat. */
  trolley: string
  /** Der Tag (ISO). */
  datum: string
  von: string
  bis: string
  /** Wen es angeht — wer eingetragen hat, abgesagt hat, mitkommt; leer: niemand. */
  person?: string
}

/**
 * **Der Rumpf einer Trolley-Mitteilung**, kanonisch deutsch:
 * „Jonas Berger · Trolley 3 · Samstag, 19. September · 09:00–11:00".
 *
 * Atom für Atom, wie jede Mitteilung (`_shared/i18n/freitext.ts`): Die Glocke
 * übersetzt beim Anzeigen, der Push je Gerätesprache. Name und Trolley sind
 * Freitext — „Trolley 3" hat die Versammlung so genannt, und ein Bruder namens
 * „Markus 2" darf nicht zur Schriftstelle werden. Der Tag kommt als Datum der
 * Wochenpläne, das der Übersetzer kennt; die Zeit bleibt, wie sie ist.
 */
export function trolleyRumpf(r: TrolleyRumpf): string {
  const tag = deutschesDatum(new Date(`${r.datum}T00:00:00Z`), true)
  return [r.person ? alsFreitext(r.person) : '', alsFreitext(r.trolley), tag, `${r.von}–${r.bis}`]
    .filter(Boolean)
    .join(' · ')
}
