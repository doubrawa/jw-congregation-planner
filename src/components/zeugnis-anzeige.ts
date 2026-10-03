/**
 * Beschriftungen des öffentlichen Zeugnisgebens (T120, Phase 3) — Planen und
 * Ansehen schreiben dieselben Zeilen.
 *
 * Datum und Wochentag kommen aus `Intl`, nicht aus dem Wörterbuch: Die
 * Schichten reichen ein Vierteljahr voraus, weit über die importierten Wochen
 * hinaus, und für die gibt es keine Wochenspanne von jw.org (`Week.range`).
 */

import { fromIso } from '../data/meeting-dates'
import type { OzSchicht } from '../data/zeugnis'
import { LOCALES } from '../i18n/langs'
import type { Lang } from '../data/types'

/** Der Tag einer Schicht: „Mittwoch, 7. Oktober". */
export function ozTagText(datum: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'long', day: 'numeric', month: 'long' }).format(fromIso(datum))
}

/** Derselbe Tag kurz, für die Zeilen der Banner: „Mi., 7. Okt.". */
export function ozKurzTag(datum: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'short', day: 'numeric', month: 'short' }).format(fromIso(datum))
}

/** Uhrzeit einer Schicht: „10:00–12:00". */
export function ozZeit(schicht: Pick<OzSchicht, 'termin'>): string {
  return `${schicht.termin.von}–${schicht.termin.bis}`
}

/** Schichten nach ihrer Woche (Montag), in der Reihenfolge, in der sie kommen. */
export function ozNachWoche(schichten: readonly OzSchicht[]): { montag: string; schichten: OzSchicht[] }[] {
  const wochen: { montag: string; schichten: OzSchicht[] }[] = []
  for (const schicht of schichten) {
    const letzte = wochen.at(-1)
    if (letzte?.montag === schicht.montag) letzte.schichten.push(schicht)
    else wochen.push({ montag: schicht.montag, schichten: [schicht] })
  }
  return wochen
}
