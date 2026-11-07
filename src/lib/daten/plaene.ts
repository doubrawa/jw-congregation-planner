/**
 * Weitere Pläne (T120, Phase 5): Pläne und ihre Einträge — Zeilen, Umformer
 * und die eine Schlange, in der ein Plan vor seinen Einträgen hinausgeht.
 */

import { isoDay, tagNach } from '../../data/meeting-dates'
import { taktVon } from '../../data/weitere-plaene'
import type { WeitererPlan, PlanEintrag, PlanTakt } from '../../data/types'
import { supabase } from '../supabase'
import { loeschenDannSchreiben, schreibSchlange } from './schreibweg'

/** Weitere Pläne (T120, Phase 5): ein Plan, eine Zeile. */
export interface PlanRow {
  id: string
  name: string
  von: string
  bis: string
  entwurf: boolean
  /** `woche` oder `monat` — die Datenbank lässt nichts anderes zu (`plaene.takt`). */
  takt: string
}

export function planFromRow(r: PlanRow): WeitererPlan {
  return { id: r.id, name: r.name, von: r.von, bis: r.bis, entwurf: r.entwurf, takt: taktVon({ takt: r.takt as PlanTakt }) }
}

function planToRow(p: WeitererPlan, congregationId: string) {
  return {
    id: p.id,
    congregation_id: congregationId,
    name: p.name,
    von: p.von,
    bis: p.bis,
    entwurf: p.entwurf,
    takt: taktVon(p),
  }
}

/** Ein Eintrag eines weiteren Plans: die Woche und ihre Gruppe, Person oder „ausgelassen". */
export interface PlanEintragRow {
  id: string
  plan_id: string
  datum: string
  grp: string | null
  person_id: string | null
  aus: boolean
}

export function planEintragFromRow(r: PlanEintragRow): PlanEintrag {
  return {
    id: r.id,
    planId: r.plan_id,
    datum: r.datum,
    grp: r.grp,
    // Person und „ausgelassen" nur, wo sie gelten — wie `eintragSetzen` sie anlegt.
    ...(r.person_id ? { pid: r.person_id } : {}),
    ...(r.aus ? { aus: true } : {}),
  }
}

function planEintragToRow(e: PlanEintrag, congregationId: string) {
  return {
    id: e.id,
    congregation_id: congregationId,
    plan_id: e.planId,
    datum: e.datum,
    grp: e.grp,
    person_id: e.pid ?? null,
    aus: e.aus ?? false,
  }
}

/**
 * Wie weit Weitere Pläne zurück geladen werden: die, die seit höchstens einem
 * Vierteljahr vorbei sind.
 */
const RUECKBLICK_TAGE = 91

/** Der erste Tag des Rückblicks (ISO). */
export function rueckblickAb(): string {
  return tagNach(isoDay(new Date()), -RUECKBLICK_TAGE)
}

/**
 * Weitere Pläne (T120, Phase 5): Pläne und Einträge in **einer** Schlange.
 * Ein neuer Eintrag zeigt auf einen Plan, der womöglich noch im Bündel wartet
 * („Neuer Plan" und gleich „Reihum verteilen"); der Plan geht deshalb vorher
 * hinaus, und die Schlange hält die Reihenfolge.
 */
const planNacheinander = schreibSchlange()

/** Pläne: anlegen oder ändern, was übergeben wird; löschen, was hier entfernt wurde (die Einträge per Kaskade). */
export function savePlaene(congregationId: string, plaene: WeitererPlan[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  planNacheinander(() => loeschenDannSchreiben(client, 'plaene', congregationId, plaene, entfernt, planToRow))
}

/**
 * Einträge: erst löschen, dann schreiben. Je Plan und Woche gibt es einen Platz
 * (`plan_eintraege_woche`); der Reducer behält deshalb die Kennung eines
 * Platzes, wenn er nur eine andere Gruppe bekommt.
 */
export function savePlanEintraege(congregationId: string, eintraege: PlanEintrag[], entfernt: string[] = []): void {
  if (!supabase) return
  const client = supabase
  planNacheinander(() => loeschenDannSchreiben(client, 'plan_eintraege', congregationId, eintraege, entfernt, planEintragToRow))
}
