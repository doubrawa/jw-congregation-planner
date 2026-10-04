/**
 * Weitere Pläne (T120, Phase 5) — reine Logik.
 *
 * Ankündigungen ohne Zuteilung: Niemand bestätigt etwas, niemand wird erinnert,
 * kein Schlüssel in `confirmations`. Es gibt eine Art, den **Königreichssaal**:
 * je Woche eine Predigtdienstgruppe. Gemessen am Buch „Organisiert, Jehovas
 * Willen zu tun", Kap. 11 Abs. 10: „In der Regel wird ein Ältester oder ein
 * Dienstamtgehilfe für diese Arbeiten einen Plan aufstellen. Im Allgemeinen
 * wechseln sich die Predigtdienstgruppen mit der Saalreinigung ab". Die Canvas
 * nannte die Vorlage „Saal & Außenanlage" — das Wort kommt dort nicht vor; der
 * Saal soll „sowohl von innen als auch von außen" würdig aussehen, und was zu
 * tun ist (Winterdienst, Grundreinigung), sagt der Name des Plans.
 *
 * Eine zweite Vorlage, „Familien reihum" (je Tag und Mahlzeit ein Gastgeber),
 * gab es vom 3. bis 4.10.2026; der Betreiber fand keine sinnvolle Planung dazu.
 *
 * Alle Funktionen sind pur.
 */

import { isoDay, montagNach, montagVon, tagNach, tagVorbei } from './meeting-dates'
import type { Group, PlanEintrag, WeitererPlan } from './types'

/** Ein neuer Plan läuft zunächst ein Vierteljahr (13 Wochen). */
export const SAAL_WOCHEN = 13

/** Ein neuer Plan, als Entwurf: ab dem Montag dieser Woche für ein Vierteljahr. Den Namen gibt der Planer. */
export function neuerPlan(id: string, heute: Date): WeitererPlan {
  const von = montagVon(isoDay(heute))
  return { id, name: '', von, bis: tagNach(von, SAAL_WOCHEN * 7 - 1), entwurf: true }
}

/** Ist der Plan vorbei (sein letzter Tag ist um)? */
export function planVorbei(plan: Pick<WeitererPlan, 'bis'>, heute = new Date()): boolean {
  return tagVorbei(plan.bis, heute)
}

/** Wo ein Plan beim Planen steht: aktuell (läuft oder kommt), Entwurf oder abgeschlossen. */
export type PlanStand = 'aktuell' | 'entwurf' | 'abgeschlossen'

export function planStand(plan: WeitererPlan, heute = new Date()): PlanStand {
  if (planVorbei(plan, heute)) return 'abgeschlossen'
  return plan.entwurf ? 'entwurf' : 'aktuell'
}

/** Pläne nach Beginn, dann nach Ende — die Reihenfolge im Zustand. */
export function planNachDatum(plaene: readonly WeitererPlan[]): WeitererPlan[] {
  return [...plaene].sort((a, b) => a.von.localeCompare(b.von) || a.bis.localeCompare(b.bis))
}

/** Die Wochen eines Plans als Montage — die erste ist die, in der er beginnt. */
export function planWochen(plan: Pick<WeitererPlan, 'von' | 'bis'>): string[] {
  const out: string[] = []
  for (let montag = montagVon(plan.von); montag <= plan.bis; montag = montagNach(montag, 1)) out.push(montag)
  return out
}

/** Die Einträge eines Plans, nach Woche. */
export function eintraegeVon(eintraege: readonly PlanEintrag[], planId: string): PlanEintrag[] {
  return eintraege.filter((e) => e.planId === planId).sort((a, b) => a.datum.localeCompare(b.datum))
}

/** Liegt ein Eintrag im Zeitraum seines Plans? Es zählt die Woche, die im Zeitraum beginnt oder in ihn hineinreicht. */
function imZeitraum(plan: WeitererPlan, e: PlanEintrag): boolean {
  return e.datum >= montagVon(plan.von) && e.datum <= plan.bis
}

/**
 * Was nach einer Änderung des Zeitraums bleibt: Einträge außerhalb gehen mit.
 * Einträge anderer Pläne bleiben unberührt — dieselbe Liste, wenn nichts geht.
 */
export function eintraegeImZeitraum(eintraege: PlanEintrag[], plan: WeitererPlan): PlanEintrag[] {
  const bleibt = eintraege.filter((e) => e.planId !== plan.id || imZeitraum(plan, e))
  return bleibt.length === eintraege.length ? eintraege : bleibt
}

/**
 * **Reihum verteilen**: die Wochen ab dieser bis zum Ende des Zeitraums, die
 * Gruppen in ihrer Reihenfolge, beginnend bei `abGruppe`. Vergangene Wochen
 * bleiben, wie sie sind — sie sind gewesen.
 *
 * Ein Platz behält seine Kennung, wenn er nur eine andere Gruppe bekommt: Die
 * Datenbank kennt je Plan und Woche genau einen Eintrag
 * (`plan_eintraege_woche`), und ein zweiter mit neuer Kennung würde
 * abgewiesen. Was gleich bleibt, behält auch seine Referenz (der Speicherweg
 * vergleicht danach).
 */
export function gruppenVerteilen(args: {
  plan: WeitererPlan
  eintraege: readonly PlanEintrag[]
  groups: readonly Group[]
  abGruppe: string
  heute: Date
  neueId: () => string
}): { eintraege: PlanEintrag[]; verteilt: number } {
  const { plan, eintraege, groups, abGruppe, heute, neueId } = args
  const andere = eintraege.filter((e) => e.planId !== plan.id)
  const eigene = eintraege.filter((e) => e.planId === plan.id)
  if (groups.length === 0) return { eintraege: [...eintraege], verteilt: 0 }
  const dieseWoche = montagVon(isoDay(heute))
  const start = Math.max(0, groups.findIndex((g) => g.id === abGruppe))
  const bleiben = eigene.filter((e) => e.datum < dieseWoche)
  const neu = planWochen(plan)
    .filter((w) => w >= dieseWoche)
    .map((woche, i): PlanEintrag => {
      const grp = groups[(start + i) % groups.length]!.id
      const da = eigene.find((e) => e.datum === woche)
      if (da) return da.grp === grp ? da : { ...da, grp }
      return { id: neueId(), planId: plan.id, datum: woche, grp }
    })
  return { eintraege: [...andere, ...bleiben, ...neu], verteilt: neu.length }
}

/**
 * Die Gruppe einer Woche setzen oder räumen. Ohne Gruppe geht der Eintrag;
 * bleibt alles, wie es war, kommt dieselbe Liste zurück.
 */
export function eintragSetzen(args: {
  eintraege: PlanEintrag[]
  planId: string
  datum: string
  grp: string | null
  neueId: () => string
}): PlanEintrag[] {
  const { eintraege, planId, datum, grp, neueId } = args
  const da = eintraege.find((e) => e.planId === planId && e.datum === datum)
  if (grp === null) return da ? eintraege.filter((e) => e !== da) : eintraege
  if (da) return da.grp === grp ? eintraege : eintraege.map((e) => (e === da ? { ...da, grp } : e))
  return [...eintraege, { id: neueId(), planId, datum, grp }]
}

/**
 * Was das Ansehen zeigt: veröffentlichte Pläne, die laufen oder kommen. Planer
 * sehen beim Ansehen dasselbe wie die Versammlung, Entwürfe nur beim Planen.
 *
 * Dieselbe Regel wie `plan_sichtbar` in schema.sql — dort entscheidet sie, hier
 * hält sie die Entwicklerseite (ohne Datenbank) und den Menüpunkt ehrlich.
 */
export function plaeneZumAnsehen(plaene: readonly WeitererPlan[], heute = new Date()): WeitererPlan[] {
  return plaene.filter((plan) => !plan.entwurf && !planVorbei(plan, heute))
}

/** Steht „Weitere Pläne" im Menü? Für Planer immer — dort legen sie den ersten an. Sonst, sobald es etwas anzusehen gibt. */
export function weiterePlaeneImMenue(args: { plaene: readonly WeitererPlan[]; planner: boolean; heute?: Date }): boolean {
  return args.planner || plaeneZumAnsehen(args.plaene, args.heute).length > 0
}

/** Die Wochen, in denen eine Gruppe dran ist — für „Deine Gruppe ist dran". */
export function wochenDerGruppe(eintraege: readonly PlanEintrag[], planId: string, grp: string): string[] {
  return eintraegeVon(eintraege, planId)
    .filter((e) => e.grp === grp)
    .map((e) => e.datum)
}
