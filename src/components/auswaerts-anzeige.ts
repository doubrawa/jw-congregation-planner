/**
 * Beschriftungen der Vorträge auswärts (T120, Phase 4) — Planen, Ansehen und
 * die Banner schreiben dieselben Zeilen.
 *
 * Datum und Wochentag kommen aus `Intl`, wie beim Zeugnisgeben: Die Vorträge
 * werden Monate im Voraus vereinbart, weit über die importierten Wochen hinaus.
 * Das „Vers." vor dem Namen übersetzt `tu` (eine Regel in `translate.ts`), den
 * Namen selbst lässt es stehen — er ist das Wort des Planers.
 */

import { gruppiertNach } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { fill } from '../i18n/useT'
import { datumsFormat } from './datum-anzeige'
import type { Dict } from '../i18n/ui'
import type { Lang, VortragAuswaerts } from '../data/types'

/** Tag und Uhrzeit: „So., 8. November · 10:00". */
export function vaWannText(v: Pick<VortragAuswaerts, 'datum' | 'zeit'>, lang: Lang): string {
  return `${datumsFormat(lang, 'kurzerWochentag').format(fromIso(v.datum))} · ${v.zeit}`
}

/** Die Versammlung, mit übersetztem Vorsatz: „Vers. Südstadt" — leer, wenn keine genannt ist. */
export function vaVersammlungText(v: Pick<VortragAuswaerts, 'versammlung'>, tu: (s: string) => string): string {
  return v.versammlung ? tu(`Vers. ${v.versammlung}`) : ''
}

/** Wo und was: „Vers. Südstadt · Vortrag Nr. 12". */
export function vaWoText(
  v: Pick<VortragAuswaerts, 'versammlung' | 'nummer'>,
  t: Pick<Dict, 'vaNummer'>,
  tu: (s: string) => string,
): string {
  const nummer = v.nummer === null ? '' : fill(t.vaNummer, { n: v.nummer })
  return [vaVersammlungText(v, tu), nummer].filter(Boolean).join(' · ')
}

/** Vorträge nach Monat („2026-11"), in der Reihenfolge, in der sie kommen. */
export function vaNachMonat<T extends Pick<VortragAuswaerts, 'datum'>>(
  vortraege: readonly T[],
): { monat: string; vortraege: T[] }[] {
  return gruppiertNach(vortraege, (v) => v.datum.slice(0, 7)).map(([monat, liste]) => ({ monat, vortraege: liste }))
}
