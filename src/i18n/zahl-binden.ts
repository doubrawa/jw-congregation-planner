/**
 * **Eine Zahl bleibt bei ihrer Bezeichnung** (T128).
 *
 * Bei 320 px und großer Schrift brach „Personen: 26" vor der Zahl um, „3 kişi"
 * hinter ihr und das Datum „7 września" zwischen Tag und Monat — gemessen im
 * echten Chrome am 18.10.2026, 94 Stellen in allen zwölf Sprachen. Dagegen hilft
 * ein geschütztes Leerzeichen an genau diesen Stellen; die Zeile bricht dann
 * davor oder dahinter, nie dazwischen.
 */

/** Das geschützte Leerzeichen (U+00A0): Dort bricht keine Zeile um. */
export const NBSP = String.fromCharCode(0xa0)

/**
 * Schützt das Leerzeichen zwischen Doppelpunkt und Zahl („Personen: 26") und
 * zwischen einer Zahl und dem Wort danach („3 kişi", „7. September", „1 Tag
 * vorher"). Ziffern und Buchstaben jeder Schrift zählen (`\p{Nd}`, `\p{L}`) —
 * auch arabische und persische.
 *
 * Ein Wort vor der Zahl („Gruppe 1", „Lied 27") bindet die Regel nicht: Solche
 * Beschriftungen sind kurz, und gemessen brach dort keine.
 */
export function zahlBinden(text: string): string {
  return text.replace(/: (?=\p{Nd})/gu, `:${NBSP}`).replace(/(\p{Nd}\.?) (?=\p{L})/gu, `$1${NBSP}`)
}
