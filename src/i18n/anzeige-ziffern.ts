/**
 * **Die Ziffern der Oberflächensprache** — für Zahlen, die die App selbst
 * zusammensetzt (Uhrzeiten, Zählungen, „20/23"), damit sie dieselben Ziffern
 * tragen wie das Datum aus `Intl` daneben. Welche das sind, sagt
 * `ziffernDerSprache` (geteilt mit den Functions).
 *
 * Die Sprache steht hier, statt an jeder der vielen Stellen hereingereicht zu
 * werden: Die App zeigt immer genau eine Oberflächensprache, und `useT` — von
 * jedem Baustein mit Text gerufen, vor dessen Kindern — stellt sie bei jedem
 * Wechsel ein. `fill` liest sie für seine Zahlen-Platzhalter.
 */

import { ziffernDerSprache } from '../../supabase/functions/_shared/i18n/ziffern-der-sprache.ts'

/** Wo die Sprache ohnehin zur Hand ist (`lang`), die reine Form — ohne den Zustand hier. */
export { ziffernDerSprache }

let sprache = 'de'

/** Welche Sprache die Oberfläche zeigt — `useT` stellt sie ein. */
export function anzeigeSpracheSetzen(lang: string): void {
  sprache = lang
}

/** Die Ziffern 0–9 eines Texts in die der Oberflächensprache. */
export function inAnzeigeZiffern(text: string): string {
  return ziffernDerSprache(text, sprache)
}
