/*
 * Countdown-Text für persönliche Aufgaben ("in 4 Tagen" / "morgen" / "heute").
 * Bewusst über Intl.RelativeTimeFormat statt über die deutsch-kanonische
 * Übersetzungsschicht: der Browser liefert die korrekte Form für jede der ~34
 * App-Sprachen selbst — inkl. Grammatik-Sonderfälle (im Deutschen wäre
 * "in 1 Tagen" falsch) und "heute"/"morgen" (numeric: 'auto').
 */
import type { Lang } from '../data/types'
import { LOCALES } from './langs'

/** Der Kalendertag eines UTC-Zeitstempels als fortlaufende Zahl. */
function tagIndex(ms: number): number {
  return Math.floor(ms / 864e5)
}

/**
 * **Heute** — als derselbe Tagesindex, aber aus den **örtlichen** Bestandteilen.
 *
 * Hier stand `Math.floor(Date.now() / 864e5)`, also der Tag in UTC. Ein Termin
 * dagegen ist ein Kalendertag (`meetingDateMs` legt ihn auf UTC-Mitternacht).
 * Zwischen Mitternacht und 01:00 bzw. 02:00 ist der UTC-Tag in Mitteleuropa
 * noch der gestrige, und dann zählte der Countdown einen Tag zu viel: Wer am
 * Dienstagmorgen um halb eins nachsah, las über seiner Aufgabe **„morgen"** —
 * für eine Zusammenkunft an diesem Abend.
 *
 * `istVorbei` (data/meeting-dates.ts) rechnet längst so; die beiden waren sich
 * in dieser Stunde uneinig. Dieselbe Verwechslung wie im Datumswähler.
 */
function heuteIndex(now: number): number {
  const d = new Date(now)
  return tagIndex(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

/**
 * Lokalisiertes Countdown-Label oder '' (kein Chip), wenn kein Zeitpunkt
 * vorliegt. Vergangene Aufgaben ergeben "vor N Tagen" — informativ und korrekt.
 */
export function relativeDayLabel(
  at: number | null | undefined,
  lang: Lang,
  now: number = Date.now(),
): string {
  if (at == null) return ''
  const days = tagIndex(at) - heuteIndex(now)
  const locale = LOCALES[lang] ?? lang
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')
  } catch {
    // Locale von Intl nicht unterstützt → lieber kein Chip als ein kaputter.
    return ''
  }
}

/**
 * Lokalisiertes Relativ-Wochen-Label für einen ganzzahligen Wochenversatz:
 * 0 → "diese Woche", 1 → "nächste Woche", -1 → "letzte Woche",
 * 2 → "in 2 Wochen", -2 → "vor 2 Wochen". Ebenfalls über Intl, damit jede
 * App-Sprache die grammatisch korrekte Form bekommt. '' wenn Intl die Locale
 * nicht kennt (dann bleibt es beim reinen Typ-Label ohne Wochenangabe).
 */
export function relativeWeekLabel(offset: number, lang: Lang): string {
  const locale = LOCALES[lang] ?? lang
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(offset, 'week')
  } catch {
    return ''
  }
}
