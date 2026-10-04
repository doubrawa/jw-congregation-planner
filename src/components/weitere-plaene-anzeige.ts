/**
 * Beschriftungen der Weiteren Pläne (T120, Phase 5) — Planen und Ansehen
 * schreiben dieselben Zeilen.
 *
 * Datum und Zeitraum kommen aus `Intl`, wie bei den übrigen Plänen: Ein Plan
 * reicht weit über die importierten Wochen hinaus. Der Name ist das Wort des
 * Planers und wird nicht übersetzt; Gruppennamen gehen durch `tu`, wie überall.
 */

import { fromIso } from '../data/meeting-dates'
import { taktVon } from '../data/weitere-plaene'
import type { Group, Lang, WeitererPlan } from '../data/types'
import { datumsFormat } from './datum-anzeige'
import { besuchsWocheText } from './gruppenbesuch-anzeige'

/** Der Zeitraum: „1. Dezember 2026 – 28. Februar 2027", zusammengezogen, wo Monat oder Jahr gleich sind. */
export function zeitraumText(plan: Pick<WeitererPlan, 'von' | 'bis'>, lang: Lang): string {
  return datumsFormat(lang, 'tagMonatJahr').formatRange(fromIso(plan.von), fromIso(plan.bis))
}

/** Eine Spanne des Plans, je nach Takt: die Woche „12.–18. Oktober" oder der Monat „Oktober 2026". */
export function spannenText(plan: Pick<WeitererPlan, 'takt'>, spanne: string, lang: Lang): string {
  return taktVon(plan) === 'monat'
    ? datumsFormat(lang, 'monatJahr').format(fromIso(spanne))
    : besuchsWocheText(spanne, lang)
}

/** Name einer Gruppe (übersetzt) — leer, wenn es sie nicht mehr gibt. */
export function gruppenName(grp: string | null, groups: readonly Group[], tu: (s: string) => string): string {
  const gruppe = grp ? groups.find((g) => g.id === grp) : undefined
  return gruppe ? tu(gruppe.name) : ''
}
