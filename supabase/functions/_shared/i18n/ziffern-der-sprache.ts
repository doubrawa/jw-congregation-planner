// =============================================================================
// Geteilt: Ziffern in der Schrift der Sprache
// =============================================================================
// Datumsangaben kommen aus `Intl` und tragen die Ziffern ihrer Sprache —
// Persisch „۸ سپتامبر". Uhrzeiten, Zählungen und Nummern setzt die App aber
// selbst zusammen („19:30", „3 نفر", „20/23"), und dort standen sie in 0–9:
// in einer Zeile mit dem Datum beides nebeneinander. Entscheidung des
// Betreibers: jede Zahl in der Schrift der Sprache.
//
// **Abgeleitet, nicht abgeschrieben:** Die zehn Ziffern kommen aus demselben
// `Intl`, mit demselben Sprach-Tag (`LOCALES`) wie das Datum. So tragen Uhrzeit
// und Datum auf jedem Gerät dieselben Ziffern — auch für Arabisch, wo es auf
// die Laufzeit ankommt: Neuere (Node 24) schreiben für `ar` 0–9, ältere
// arabisch-indisch. Persisch ist überall persisch, die übrigen App-Sprachen
// bleiben bei 0–9 und laufen hier durch, ohne dass etwas geschieht.
//
// Eigenes Modul, weil es beide Seiten brauchen: der Übersetzer und die
// Oberfläche im Client, die Push-Texte in den Functions.
// =============================================================================

import { LOCALE_JE_CODE as LOCALES } from './locales.ts'

/** Je Sprach-Code die zehn Ziffern, 0 bis 9 — `null`, wo es 0–9 sind. */
const saetze = new Map<string, readonly string[] | null>()

/** Die Ziffern 0 bis 9 der Sprache, wie `Intl` sie schreibt — `null` für 0–9 oder ein unbekanntes Tag. */
export function ziffernSatz(code: string): readonly string[] | null {
  const bekannt = saetze.get(code)
  if (bekannt !== undefined) return bekannt
  let satz: readonly string[] | null = null
  try {
    // „1234567890": die Null steht zuletzt.
    const zeichen = [...new Intl.NumberFormat(LOCALES[code] ?? code, { useGrouping: false }).format(1234567890)]
    const geordnet = [zeichen[9] ?? '0', ...zeichen.slice(0, 9)]
    if (zeichen.length === 10 && geordnet.join('') !== '0123456789') satz = geordnet
  } catch {
    // Kein gültiges Sprach-Tag: Dann bleibt es bei 0–9.
  }
  saetze.set(code, satz)
  return satz
}

/** Nur Ziffern 0–9 und was eine Zahl, Uhrzeit oder Spanne sonst trägt. */
const NUR_ZAHL = /^[\d\s:./–-]+$/

/**
 * Steht hier nur eine Zahl („19:30", „20/23", „7–13")? Die schreibt die App,
 * sie bekommt die Ziffern der Sprache. Ein Text mit Buchstaben gehört jemandem
 * — ein Ort, ein Dienstname, ein Anmelde-Code — und bleibt, wie er ist.
 */
export function nurZahl(text: string): boolean {
  return NUR_ZAHL.test(text)
}

/** Die Ziffern 0–9 eines Texts (oder einer Zahl) in die der Sprache übertragen; jedes andere Zeichen bleibt. */
export function ziffernDerSprache(text: string | number, code: string): string {
  const satz = ziffernSatz(code)
  const roh = String(text)
  return satz ? roh.replace(/[0-9]/g, (d) => satz[Number(d)] ?? d) : roh
}
