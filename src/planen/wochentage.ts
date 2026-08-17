import { LOCALES } from '../i18n/langs'

/**
 * Kanonisch deutsche Wochentage — dieselbe Schreibweise wie in den Wochendaten
 * (`WEEKDAY_OFFSET`), Index = Tage nach Montag. Gespeichert wird immer diese
 * Form; übersetzt wird erst bei der Anzeige.
 */
export const WOCHENTAGE = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
]

/**
 * Wochentagsname in der App-Sprache — aus `Intl`, nicht aus dem Wörterbuch.
 *
 * Derselbe Weg wie im Treffpunkt-Konfliktbanner: die Namen der Wochentage sind
 * in jeder Sprache Teil der Laufzeitumgebung. Sie zusätzlich in 34
 * Wörterbücher zu schreiben, hieße 238 Übersetzungen zu pflegen, die es
 * geschenkt gibt.
 *
 * Der 5. Januar 2026 ist ein Montag — Bezugspunkt für den Versatz.
 *
 * Liegt seit T63 hier statt in `SonderwochePanel`: Die Termine der Woche
 * brauchen dieselbe Auswahl, und zwei Listen deutscher Wochentage wären zwei
 * Gelegenheiten, sie verschieden zu schreiben.
 */
export function wochentagName(versatz: number, lang: string): string {
  const d = new Date(2026, 0, 5 + versatz)
  return d.toLocaleDateString(LOCALES[lang as keyof typeof LOCALES], { weekday: 'long' })
}
