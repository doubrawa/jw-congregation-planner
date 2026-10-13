/*
 * Countdown-Text für persönliche Aufgaben ("in 4 Tagen" / "morgen" / "heute").
 * Bewusst über Intl.RelativeTimeFormat statt über die deutsch-kanonische
 * Übersetzungsschicht: der Browser liefert die korrekte Form für jede der ~34
 * App-Sprachen selbst — inkl. Grammatik-Sonderfälle (im Deutschen wäre
 * "in 1 Tagen" falsch) und "heute"/"morgen" (numeric: 'auto').
 */
import { kalendertagMs } from '../data/meeting-dates'
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
  return tagIndex(kalendertagMs(new Date(now)))
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
 * **Wie viele Wochen her** — „vor 1 Woche", „vor 12 Wochen": das „zuletzt …"
 * im Zuteilen-Blatt (T121). Ebenfalls über Intl, damit jede App-Sprache die
 * grammatisch richtige Form bekommt; immer mit Zahl (`numeric: 'always'`),
 * denn „zuletzt letzte Woche" sagt niemand. '' wenn Intl die Sprache nicht
 * kennt — dann lässt das Blatt die Angabe weg.
 */
export function wochenHer(wochen: number, lang: Lang): string {
  const locale = LOCALES[lang] ?? lang
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-wochen, 'week')
  } catch {
    return ''
  }
}
