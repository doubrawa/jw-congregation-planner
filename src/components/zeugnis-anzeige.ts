/**
 * Beschriftungen des öffentlichen Zeugnisgebens (T120, Phase 3) — Planen und
 * Ansehen schreiben dieselben Zeilen.
 *
 * Datum und Wochentag kommen aus `Intl`, nicht aus dem Wörterbuch: Die
 * Schichten reichen ein Vierteljahr voraus, weit über die importierten Wochen
 * hinaus, und für die gibt es keine Wochenspanne von jw.org (`Week.range`).
 */

import { gruppiertNach } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import type { OzSchicht } from '../data/zeugnis'
import type { Lang } from '../data/types'
import { datumsFormat } from './datum-anzeige'
import { zeitleisteDatum } from './zeitleiste-gemeinsam'

/**
 * Der Tag einer Schicht mit ihrer Uhrzeit: „Mittwoch, 7. Oktober · 10:00–12:00"
 * — dieselbe Form wie in der Zeitleiste (`zeitleisteDatum`).
 */
export function ozSchichtText(schicht: Pick<OzSchicht, 'datum' | 'termin'>, lang: Lang): string {
  return zeitleisteDatum(fromIso(schicht.datum), lang, ozZeit(schicht))
}

/** Derselbe Tag kurz, für die Zeilen der Banner: „Mi., 7. Okt.". */
export function ozKurzTag(datum: string, lang: Lang): string {
  return datumsFormat(lang, 'kurzerTag').format(fromIso(datum))
}

/** Uhrzeit einer Schicht: „10:00–12:00". */
export function ozZeit(schicht: Pick<OzSchicht, 'termin'>): string {
  return `${schicht.termin.von}–${schicht.termin.bis}`
}

/** Schichten nach ihrer Woche (Montag), in der Reihenfolge, in der sie kommen. */
export function ozNachWoche(schichten: readonly OzSchicht[]): { montag: string; schichten: OzSchicht[] }[] {
  return gruppiertNach(schichten, (s) => s.montag).map(([montag, liste]) => ({ montag, schichten: liste }))
}
