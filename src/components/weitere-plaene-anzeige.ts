/**
 * Beschriftungen der Weiteren Pläne (T120, Phase 5) — Planen und Ansehen
 * schreiben dieselben Zeilen.
 *
 * Datum und Zeitraum kommen aus `Intl`, wie bei den übrigen Plänen: Ein Plan
 * reicht weit über die importierten Wochen hinaus. Der Name ist das Wort des
 * Planers und wird nicht übersetzt; Gruppennamen gehen durch `tu`, wie überall.
 */

import { fromIso } from '../data/meeting-dates'
import { taktVon, type PlanStand } from '../data/weitere-plaene'
import type { Group, Lang, WeitererPlan } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { datumsFormat, wochenSpanne, zeitspanne } from './datum-anzeige'

/** Der Zeitraum: „1. Dezember 2026 – 28. Februar 2027", zusammengezogen, wo Monat oder Jahr gleich sind. */
export function zeitraumText(plan: Pick<WeitererPlan, 'von' | 'bis'>, lang: Lang): string {
  return datumsFormat(lang, 'tagMonatJahr').formatRange(fromIso(plan.von), fromIso(plan.bis))
}

/** Ein Tag eines Plans mit Jahr: „29. November 2026". */
function planTagText(tag: string, lang: Lang): string {
  return datumsFormat(lang, 'tagMonatJahr').format(fromIso(tag))
}

/**
 * **Was die Liste beim Planen unter dem Namen eines Plans sagt** (Entwurf
 * `GPlaeneListe`): beim Entwurf den Zeitraum, beim laufenden Plan, bis wann er
 * läuft, beim kommenden, ab wann, beim abgeschlossenen, wann er endete. `tag`
 * ist heute (ISO). Das Jahr steht immer dabei: Abgeschlossene Pläne sammeln
 * sich über die Jahre.
 */
export function planUnterzeile(
  plan: WeitererPlan,
  stand: PlanStand,
  tag: string,
  lang: Lang,
  t: Pick<Dict, 'wpAbDatum' | 'wpBisDatum' | 'wpEndete'>,
): string {
  if (stand === 'entwurf') return zeitraumText(plan, lang)
  if (stand === 'abgeschlossen') return fill(t.wpEndete, { datum: planTagText(plan.bis, lang) })
  return plan.von > tag
    ? fill(t.wpAbDatum, { datum: planTagText(plan.von, lang) })
    : fill(t.wpBisDatum, { datum: planTagText(plan.bis, lang) })
}

/**
 * Wie viele Wochen oder Monate, in Worten der Sprache: „13 Wochen", „8 Monate".
 * Die Mehrzahl kennt `Intl` — ein „{n} Wochen" in den Übersetzungen kennte sie
 * nicht.
 */
export function spannenAnzahl(plan: Pick<WeitererPlan, 'takt'>, n: number, lang: Lang): string {
  return zeitspanne(n, taktVon(plan) === 'monat' ? 'month' : 'week', lang)
}

/** Eine Spanne des Plans, je nach Takt: die Woche „12.–18. Oktober" oder der Monat „Oktober 2026". */
export function spannenText(plan: Pick<WeitererPlan, 'takt'>, spanne: string, lang: Lang): string {
  return taktVon(plan) === 'monat'
    ? datumsFormat(lang, 'monatJahr').format(fromIso(spanne))
    : wochenSpanne(spanne, lang)
}

/** Name einer Gruppe (übersetzt) — leer, wenn es sie nicht mehr gibt. */
export function gruppenName(grp: string | null, groups: readonly Group[], tu: (s: string) => string): string {
  const gruppe = grp ? groups.find((g) => g.id === grp) : undefined
  return gruppe ? tu(gruppe.name) : ''
}
