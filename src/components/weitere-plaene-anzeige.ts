/**
 * Beschriftungen der Weiteren Pläne (T120, Phase 5) — Planen und Ansehen
 * schreiben dieselben Zeilen.
 *
 * Datum und Zeitraum kommen aus `Intl`, wie bei den übrigen Plänen: Ein Plan
 * reicht weit über die importierten Wochen hinaus. Der Name ist das Wort des
 * Planers und wird nicht übersetzt; Gruppennamen gehen durch `tu`, wie überall.
 */

import { displayName } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import type { Dict } from '../i18n/ui'
import type { Group, Lang, Mahlzeit, Person, PlanVorlage, WeitererPlan } from '../data/types'
import { datumsFormat } from './datum-anzeige'

/** Name der Vorlage: „Königreichssaal" bzw. „Familien reihum". */
export function vorlageName(vorlage: PlanVorlage, t: Pick<Dict, 'saal' | 'wpFamilien'>): string {
  return vorlage === 'saal' ? t.saal : t.wpFamilien
}

/** Was die Vorlage tut — ein Satz für die Auswahl und den Kopf des Plans. */
export function vorlageText(vorlage: PlanVorlage, t: Pick<Dict, 'wpSaalText' | 'wpFamilienText'>): string {
  return vorlage === 'saal' ? t.wpSaalText : t.wpFamilienText
}

/** Der Zeitraum: „1. Dezember 2026 – 28. Februar 2027", zusammengezogen, wo Monat oder Jahr gleich sind. */
export function zeitraumText(plan: Pick<WeitererPlan, 'von' | 'bis'>, lang: Lang): string {
  return datumsFormat(lang, 'tagMonatJahr').formatRange(fromIso(plan.von), fromIso(plan.bis))
}

/** Die Mahlzeit eines Platzes. */
export function mahlzeitName(m: Mahlzeit, t: Pick<Dict, 'wpFruehstueck' | 'wpMittag' | 'wpAbend'>): string {
  return m === 'fruehstueck' ? t.wpFruehstueck : m === 'mittag' ? t.wpMittag : t.wpAbend
}

/** Name einer Gruppe (übersetzt) — leer, wenn es sie nicht mehr gibt. */
export function gruppenName(grp: string | null, groups: readonly Group[], tu: (s: string) => string): string {
  const gruppe = grp ? groups.find((g) => g.id === grp) : undefined
  return gruppe ? tu(gruppe.name) : ''
}

/** Name des Gastgebers — leer, wenn keiner (mehr) eingetragen ist. */
export function gastgeberName(pid: string | null, persons: readonly Person[]): string {
  const person = pid ? persons.find((p) => p.id === pid) : undefined
  return person ? displayName(person) : ''
}
