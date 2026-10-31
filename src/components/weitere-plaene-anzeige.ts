/**
 * Beschriftungen der Weiteren Pläne (T120, Phase 5) — Planen und Ansehen
 * schreiben dieselben Zeilen.
 *
 * Datum und Zeitraum kommen aus `Intl`, wie bei den übrigen Plänen: Ein Plan
 * reicht weit über die importierten Wochen hinaus — gebunden wie jedes Datum
 * (`gebundenesDatum`, `tageSpanne`, T128). Der Name ist das Wort des Planers und
 * wird nicht übersetzt; Gruppennamen gehen durch `tu`, wie überall, Namen von
 * Personen nicht.
 */

import { nameVon } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { taktVon, type PlanStand } from '../data/weitere-plaene'
import type { Group, Lang, Person, PlanEintrag, WeitererPlan } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { gebundenesDatum, tageSpanne, wochenSpanne, zeitspanne } from './datum-anzeige'

/** Der Zeitraum: „1. Dezember 2026 – 28. Februar 2027", zusammengezogen, wo Monat oder Jahr gleich sind. */
export function zeitraumText(plan: Pick<WeitererPlan, 'von' | 'bis'>, lang: Lang): string {
  return tageSpanne(plan.von, plan.bis, lang, 'tagMonatJahr')
}

/** Ein Tag eines Plans mit Jahr: „29. November 2026". */
function planTagText(tag: string, lang: Lang): string {
  return gebundenesDatum(fromIso(tag), lang, 'tagMonatJahr')
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
  return taktVon(plan) === 'monat' ? gebundenesDatum(fromIso(spanne), lang, 'monatJahr') : wochenSpanne(spanne, lang)
}

/** Name einer Gruppe (übersetzt) — leer, wenn es sie nicht mehr gibt. */
export function gruppenName(grp: string | null, groups: readonly Group[], tu: (s: string) => string): string {
  const gruppe = grp ? groups.find((g) => g.id === grp) : undefined
  return gruppe ? tu(gruppe.name) : ''
}

/**
 * Wer in einer Spanne dran ist: der Name der Gruppe (übersetzt) oder der Person
 * (31.10.2026) — leer, wenn sie offen ist oder es beide nicht mehr gibt.
 */
export function werName(
  eintrag: Pick<PlanEintrag, 'grp' | 'pid'> | undefined,
  daten: { groups: readonly Group[]; persons: readonly Person[] },
  tu: (s: string) => string,
): string {
  if (eintrag?.pid) return nameVon(daten.persons, eintrag.pid)
  return gruppenName(eintrag?.grp ?? null, daten.groups, tu)
}
