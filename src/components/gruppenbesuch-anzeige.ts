/**
 * Beschriftungen der Gruppenbesuche (T120, Phase 2) — Planen, Ansehen und die
 * Planungs-Karte schreiben dieselben Zeilen.
 *
 * Das Datum kommt aus `Intl`, nicht aus dem Wörterbuch: Ein Besuch kann in
 * einer Woche liegen, die noch nicht importiert ist, und dann gibt es keine
 * Wochenspanne von jw.org (`Week.range`), die man übersetzen könnte. Die
 * Woche selbst schreibt `wochenSpanne` (`datum-anzeige.ts`).
 */

import type { FsInstance, Group, Gruppenbesuch, Lang, Person } from '../data/types'
import { displayName } from '../data/helpers'
import { treffpunktTagLabel } from './treffpunkt-beschriftung'

/** Ein Treffpunkt der Besuchswoche: „Samstag, 17. Oktober · 09:15 · Königreichssaal". */
export function besuchsTreffpunktText(
  woche: string,
  inst: Pick<FsInstance, 'wd' | 'time' | 'place'>,
  lang: Lang,
  tu: (s: string) => string,
): string {
  // Der Ort ist frei und darf fehlen — auch einer aus Leerzeichen gilt als keiner.
  return [treffpunktTagLabel(woche, inst.wd, lang), inst.time, tu(inst.place).trim()].filter(Boolean).join(' · ')
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

