import { LOCALES } from '../i18n/langs'
import { versatzAbMontag } from '../data/meeting-dates'

/**
 * Die sieben Wochentage als **Versatz ab Montag** — die Reihenfolge, in der sie
 * in einer Auswahl stehen.
 *
 * Hier stand dieselbe Liste mit deutschen Namen, denn genau die wurden
 * gespeichert. Ein Wochentag ist jetzt überall eine Zahl (`Abweichung.wd`,
 * `Termin.wd`, `FsRule.wd`, `MeetingTime.wd`), und sein Name entsteht erst beim
 * Anzeigen — `wochentagName` darunter, in der Sprache des Lesers.
 */
export const VERSAETZE: readonly number[] = [0, 1, 2, 3, 4, 5, 6]

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

/**
 * Wochentagsname aus dem **gespeicherten** Wochentag (0 = Sonntag … 6 =
 * Samstag), wie ihn `FsRule.wd`, `Termin.wd` und `MeetingTime.wd` tragen.
 *
 * Das ist die Zählung der Datenbank; `wochentagName` darüber rechnet mit dem
 * Versatz ab Montag. Fünf Aufrufstellen schrieben die Umrechnung als
 * `wochentagName((wd + 6) % 7, lang)` von Hand aus — dieselbe Anzeige in zwei
 * Schreibweisen, und `(wd + 6) % 7` sagt an keiner davon, was es bedeutet.
 */
export function wochentagNameAusWd(wd: number, lang: string): string {
  return wochentagName(versatzAbMontag(wd), lang)
}
