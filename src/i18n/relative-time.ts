/*
 * Countdown-Text für persönliche Aufgaben ("in 4 Tagen" / "morgen" / "heute").
 * Bewusst über Intl.RelativeTimeFormat statt über die deutsch-kanonische
 * Übersetzungsschicht: der Browser liefert die korrekte Form für jede der ~34
 * App-Sprachen selbst — inkl. Grammatik-Sonderfälle (im Deutschen wäre
 * "in 1 Tagen" falsch) und "heute"/"morgen" (numeric: 'auto').
 */
import type { Lang } from '../data/types'
import { LOCALES } from './langs'

/** Ganze Kalendertage zwischen zwei UTC-ms-Zeitpunkten (auf Mitternacht normiert). */
function wholeDaysBetween(fromMs: number, toMs: number): number {
  const day = 864e5
  const a = Math.floor(fromMs / day)
  const b = Math.floor(toMs / day)
  return b - a
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
  const days = wholeDaysBetween(now, at)
  const locale = LOCALES[lang] ?? lang
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day')
  } catch {
    // Locale von Intl nicht unterstützt → lieber kein Chip als ein kaputter.
    return ''
  }
}
