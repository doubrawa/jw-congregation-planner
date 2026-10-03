/**
 * Beschriftungen der Gruppenbesuche (T120, Phase 2) — Planen, Ansehen und die
 * Planungs-Karte schreiben dieselben Zeilen.
 *
 * Datum und Monat kommen aus `Intl`, nicht aus dem Wörterbuch: Ein Besuch kann
 * in einer Woche liegen, die noch nicht importiert ist, und dann gibt es keine
 * Wochenspanne von jw.org (`Week.range`), die man übersetzen könnte.
 */

import { besuchsMonat } from '../data/gruppenbesuche'
import { fromIso, isoDay, versatzAbMontag } from '../data/meeting-dates'
import { LOCALES } from '../i18n/langs'
import type { FsInstance, Group, Gruppenbesuch, Lang, Person } from '../data/types'
import { displayName } from '../data/helpers'
import { treffpunktTagLabel } from './treffpunkt-beschriftung'

/** Die Woche eines Besuchs als Spanne von Montag bis Sonntag: „12.–18. Oktober". */
export function besuchsWocheText(woche: string, lang: Lang): string {
  const montag = fromIso(woche)
  const sonntag = fromIso(woche)
  sonntag.setDate(sonntag.getDate() + 6)
  return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'long' }).formatRange(montag, sonntag)
}

/** Ein Monat („2026-10") als Überschrift: „Oktober 2026". */
export function monatText(monat: string, lang: Lang): string {
  const [y = 0, m = 1] = monat.split('-').map(Number)
  return new Intl.DateTimeFormat(LOCALES[lang], { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1, 12))
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
  const monate: { monat: string; eintraege: T[] }[] = []
  for (const eintrag of eintraege) {
    const monat = besuchsMonat(eintrag.besuch.woche)
    const letzter = monate.at(-1)
    if (letzter?.monat === monat) letzter.eintraege.push(eintrag)
    else monate.push({ monat, eintraege: [eintrag] })
  }
  return monate
}

/** Der Montag der Woche, in der `tag` liegt (ISO). */
export function montagDerWoche(tag: Date): string {
  const d = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), 12)
  d.setDate(d.getDate() - versatzAbMontag(d.getDay()))
  return isoDay(d)
}
