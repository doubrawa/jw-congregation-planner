/**
 * Weitere Pläne (T120, Phase 5) — reine Logik.
 *
 * Ankündigungen ohne Zuteilung: Niemand bestätigt etwas, niemand wird erinnert,
 * kein Schlüssel in `confirmations`. Zwei feste Vorlagen (Entscheidung des
 * Betreibers, 2.10.2026 — kein Baukasten):
 *
 * - **Königreichssaal** (`saal`): je Woche eine Predigtdienstgruppe. Gemessen
 *   am Buch „Organisiert, Jehovas Willen zu tun", Kap. 11 Abs. 10: „In der
 *   Regel wird ein Ältester oder ein Dienstamtgehilfe für diese Arbeiten einen
 *   Plan aufstellen. Im Allgemeinen wechseln sich die Predigtdienstgruppen mit
 *   der Saalreinigung ab". Die Canvas nannte die Vorlage „Saal & Außenanlage" —
 *   das Wort kommt dort nicht vor; der Saal soll „sowohl von innen als auch von
 *   außen" würdig aussehen, und was zu tun ist (Winterdienst, Grundreinigung),
 *   sagt der Name des Plans.
 * - **Familien reihum** (`familien`): je Tag und Mahlzeit ein Gastgeber — etwa
 *   beim Besuch des Kreisaufsehers (Kap. 5 Abs. 55: Unterkunft und andere
 *   notwendige Dinge; Abs. 58: Mahlzeiten; Abs. 63: Gastfreundschaft).
 *
 * Alle Funktionen sind pur.
 */

import { fromIso, isoDay, istVorbei, kalendertagMs, montagNach, montagVon } from './meeting-dates'
import type { Group, Mahlzeit, Person, PlanEintrag, PlanVorlage, WeitererPlan } from './types'

/** Die Vorlagen in der Reihenfolge, in der sie zur Wahl stehen. */
export const PLAN_VORLAGEN: readonly PlanVorlage[] = ['saal', 'familien']

/** Die Mahlzeiten eines Tages, in ihrer Reihenfolge. */
export const MAHLZEITEN: readonly Mahlzeit[] = ['fruehstueck', 'mittag', 'abend']

/** Ein neuer Königreichssaal-Plan läuft zunächst ein Vierteljahr (13 Wochen). */
export const SAAL_WOCHEN = 13
/** Familien reihum zunächst eine Woche — so lange dauert ein Besuch des Kreisaufsehers. */
export const FAMILIEN_TAGE = 7

/** Ein Tag `tage` Tage nach `datum` (ISO, in UTC gerechnet — ohne Sommerzeitsprung). */
export function tagNach(datum: string, tage: number): string {
  return new Date(Date.parse(datum) + tage * 864e5).toISOString().slice(0, 10)
}

/**
 * Ein neuer Plan, als Entwurf: Der Königreichssaal ab dem Montag dieser Woche
 * für ein Vierteljahr, Familien reihum ab heute für eine Woche. Den Namen gibt
 * der Planer.
 */
export function neuerPlan(id: string, vorlage: PlanVorlage, heute: Date): WeitererPlan {
  const tag = isoDay(heute)
  if (vorlage === 'saal') {
    const von = montagVon(tag)
    return { id, vorlage, name: '', von, bis: tagNach(von, SAAL_WOCHEN * 7 - 1), entwurf: true }
  }
  return { id, vorlage, name: '', von: tag, bis: tagNach(tag, FAMILIEN_TAGE - 1), entwurf: true }
}

/** Ist der Plan vorbei (sein letzter Tag ist um)? */
export function planVorbei(plan: Pick<WeitererPlan, 'bis'>, heute = new Date()): boolean {
  return istVorbei(kalendertagMs(fromIso(plan.bis)), heute)
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

/** Die Tage eines Plans, vom ersten bis zum letzten. */
export function planTage(plan: Pick<WeitererPlan, 'von' | 'bis'>): string[] {
  const out: string[] = []
  for (let tag = plan.von; tag <= plan.bis; tag = tagNach(tag, 1)) out.push(tag)
  return out
}

/** Die Einträge eines Plans, nach Tag und Mahlzeit. */
export function eintraegeVon(eintraege: readonly PlanEintrag[], planId: string): PlanEintrag[] {
  const rang = (m: Mahlzeit | null) => (m === null ? -1 : MAHLZEITEN.indexOf(m))
  return eintraege
    .filter((e) => e.planId === planId)
    .sort((a, b) => a.datum.localeCompare(b.datum) || rang(a.mahlzeit) - rang(b.mahlzeit))
}

/** Liegt ein Eintrag im Zeitraum seines Plans? Beim Königreichssaal zählt die Woche, die im Zeitraum beginnt oder in ihn hineinreicht. */
function imZeitraum(plan: WeitererPlan, e: PlanEintrag): boolean {
  const ab = plan.vorlage === 'saal' ? montagVon(plan.von) : plan.von
  return e.datum >= ab && e.datum <= plan.bis
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
 * **Reihum verteilen** (Königreichssaal): die Wochen ab dieser bis zum Ende
 * des Zeitraums, die Gruppen in ihrer Reihenfolge, beginnend bei `abGruppe`.
 * Vergangene Wochen bleiben, wie sie sind — sie sind gewesen.
 *
 * Ein Platz behält seine Kennung, wenn er nur eine andere Gruppe bekommt: Die
 * Datenbank kennt je Plan und Woche genau einen Eintrag
 * (`plan_eintraege_platz`), und ein zweiter mit neuer Kennung würde abgewiesen.
 * Was gleich bleibt, behält auch seine Referenz (der Speicherweg vergleicht
 * danach).
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
      const da = eigene.find((e) => e.datum === woche && e.mahlzeit === null)
      if (da) return da.grp === grp && da.pid === null ? da : { ...da, grp, pid: null }
      return { id: neueId(), planId: plan.id, datum: woche, grp, pid: null, mahlzeit: null }
    })
  return { eintraege: [...andere, ...bleiben, ...neu], verteilt: neu.length }
}

/**
 * Einen Platz setzen oder räumen: je Woche (Gruppe) bzw. je Tag und Mahlzeit
 * (Gastgeber) einer. Sind Gruppe und Gastgeber leer, geht der Eintrag; bleibt
 * alles, wie es war, kommt dieselbe Liste zurück.
 */
export function eintragSetzen(args: {
  eintraege: PlanEintrag[]
  planId: string
  datum: string
  mahlzeit: Mahlzeit | null
  grp: string | null
  pid: string | null
  neueId: () => string
}): PlanEintrag[] {
  const { eintraege, planId, datum, mahlzeit, grp, pid, neueId } = args
  const da = eintraege.find((e) => e.planId === planId && e.datum === datum && e.mahlzeit === mahlzeit)
  if (grp === null && pid === null) return da ? eintraege.filter((e) => e !== da) : eintraege
  if (da) return da.grp === grp && da.pid === pid ? eintraege : eintraege.map((e) => (e === da ? { ...da, grp, pid } : e))
  return [...eintraege, { id: neueId(), planId, datum, grp, pid, mahlzeit }]
}

/** Ist dieser Gastgeber man selbst oder jemand aus dem eigenen Haushalt (`persons.fam`)? */
export function eigenerHaushalt(
  pid: string | null,
  me: Pick<Person, 'id' | 'fam'> | undefined,
  persons: readonly Pick<Person, 'id' | 'fam'>[],
): boolean {
  if (!pid || !me) return false
  if (pid === me.id) return true
  return Boolean(me.fam && persons.find((p) => p.id === pid)?.fam === me.fam)
}

/**
 * Darf die eigene Person diesen Plan sehen? Dieselbe Regel wie
 * `plan_sichtbar` in schema.sql — dort entscheidet sie, hier hält sie die
 * Entwicklerseite (ohne Datenbank) und den Menüpunkt ehrlich: Planer alles;
 * sonst nur Veröffentlichtes — den Königreichssaal alle, Familien reihum nur
 * die Gastgeber und ihre Haushalte.
 */
export function planFuerMich(args: {
  plan: WeitererPlan
  eintraege: readonly PlanEintrag[]
  planner: boolean
  me: Pick<Person, 'id' | 'fam'> | undefined
  persons: readonly Pick<Person, 'id' | 'fam'>[]
}): boolean {
  const { plan, eintraege, planner, me, persons } = args
  if (planner) return true
  if (plan.entwurf) return false
  if (plan.vorlage === 'saal') return true
  return eintraege.some((e) => e.planId === plan.id && eigenerHaushalt(e.pid, me, persons))
}

/**
 * Was das Ansehen zeigt: veröffentlichte Pläne, die laufen oder kommen — und
 * davon, was die eigene Person sehen darf. Planer sehen beim Ansehen dasselbe
 * wie die Versammlung, Entwürfe nur beim Planen.
 */
export function plaeneZumAnsehen(args: {
  plaene: readonly WeitererPlan[]
  eintraege: readonly PlanEintrag[]
  planner: boolean
  me: Pick<Person, 'id' | 'fam'> | undefined
  persons: readonly Pick<Person, 'id' | 'fam'>[]
  heute?: Date
}): WeitererPlan[] {
  const { plaene, heute = new Date(), ...rest } = args
  return plaene.filter((plan) => !plan.entwurf && !planVorbei(plan, heute) && planFuerMich({ plan, ...rest }))
}

/** Steht „Weitere Pläne" im Menü? Für Planer immer — dort legen sie den ersten an. Sonst, sobald es etwas anzusehen gibt. */
export function weiterePlaeneImMenue(args: Parameters<typeof plaeneZumAnsehen>[0]): boolean {
  return args.planner || plaeneZumAnsehen(args).length > 0
}

/** Die Wochen, in denen eine Gruppe dran ist (Königreichssaal) — für „Deine Gruppe ist dran". */
export function wochenDerGruppe(eintraege: readonly PlanEintrag[], planId: string, grp: string): string[] {
  return eintraegeVon(eintraege, planId)
    .filter((e) => e.grp === grp)
    .map((e) => e.datum)
}
