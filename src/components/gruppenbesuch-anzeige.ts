/**
 * Beschriftungen der Gruppenbesuche (T120, Phase 2) — Planen, Ansehen und die
 * Planungs-Karte schreiben dieselben Zeilen.
 *
 * Datum und Monat kommen aus `Intl`, nicht aus dem Wörterbuch: Ein Besuch kann
 * in einer Woche liegen, die noch nicht importiert ist, und dann gibt es keine
 * Wochenspanne von jw.org (`Week.range`), die man übersetzen könnte.
 */

import { besuchsMonat } from '../data/gruppenbesuche'
import { fromIso, tagNach } from '../data/meeting-dates'
import type { FsInstance, Group, Gruppenbesuch, Lang, Person } from '../data/types'
import { displayName, gruppiertNach } from '../data/helpers'
import { datumsFormat } from './datum-anzeige'
import { treffpunktTagLabel } from './treffpunkt-beschriftung'

/** Die Woche eines Besuchs als Spanne von Montag bis Sonntag: „12.–18. Oktober". */
export function besuchsWocheText(woche: string, lang: Lang): string {
  return datumsFormat(lang, 'tagMonat').formatRange(fromIso(woche), fromIso(tagNach(woche, 6)))
}

/** Ein Treffpunkt der Besuchswoche: „Samstag, 17. Oktober · 09:15 · Königreichssaal". */
export function besuchsTreffpunktText(
  woche: string,
  inst: Pick<FsInstance, 'wd' | 'time' | 'place'>,
  lang: Lang,
  tu: (s: string) => string,
): string {
  return [treffpunktTagLabel(woche, inst.wd, lang), inst.time, tu(inst.place)].filter(Boolean).join(' · ')
}

/** Name der besuchten Gruppe (übersetzt) — die rohe Id, falls es sie nicht mehr gibt. */
export function besuchsGruppe(besuch: Pick<Gruppenbesuch, 'grp'>, groups: readonly Group[], tu: (s: string) => string): string {
  const gruppe = groups.find((g) => g.id === besuch.grp)
  return gruppe ? tu(gruppe.name) : besuch.grp
}

/** Name des Besuchers — leer, wenn keiner (mehr) eingesetzt ist. */
export function besucherName(besuch: Pick<Gruppenbesuch, 'pid'>, persons: readonly Person[]): string {
  const person = besuch.pid ? persons.find((p) => p.id === besuch.pid) : undefined
  return person ? displayName(person) : ''
}

/** Besuche nach Monat ihres Wochenendes gruppiert, in der Reihenfolge, in der sie kommen. */
export function nachMonat<T extends { besuch: Gruppenbesuch }>(eintraege: readonly T[]): { monat: string; eintraege: T[] }[] {
  return gruppiertNach(eintraege, (e) => besuchsMonat(e.besuch.woche)).map(([monat, liste]) => ({ monat, eintraege: liste }))
}
