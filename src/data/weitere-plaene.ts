/**
 * Weitere Pläne (T120, Phase 5) — reine Logik.
 *
 * Ankündigungen ohne Zuteilung: Niemand bestätigt etwas, niemand wird erinnert,
 * kein Schlüssel in `confirmations`. Es gibt eine Art, den **Königreichssaal**:
 * je Woche (oder je Monat, siehe unten) eine Predigtdienstgruppe. Gemessen am Buch „Organisiert, Jehovas
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
 * **Der Takt ist wählbar** (4.10.2026): je Woche oder je Kalendermonat eine
 * Gruppe. Eine Woche oder ein Monat heißt hier eine **Spanne**; sie steht als
 * ihr erster Tag in den Einträgen (Montag bzw. Monatserster). Eine Woche
 * gehört zu dem Monat, in dem sie beginnt.
 *
 * Alle Funktionen sind pur.
 */

import { isoDay, monatNach, montagNach, montagVon, tagNach, tagVorbei } from './meeting-dates'
import type { Group, PlanEintrag, PlanTakt, WeitererPlan } from './types'

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

/** Der Takt eines Plans — `woche`, solange keiner gesetzt ist (siehe `WeitererPlan.takt`). */
export function taktVon(plan: Pick<WeitererPlan, 'takt'>): PlanTakt {
  return plan.takt === 'monat' ? 'monat' : 'woche'
}

/** Der Erste des Monats, in dem `datum` (ISO) liegt. */
export function monatsErster(datum: string): string {
  return `${datum.slice(0, 7)}-01`
}

/** Der Erste des Folgemonats (ISO). */
function naechsterMonatsErster(erster: string): string {
  return `${monatNach(erster.slice(0, 7))}-01`
}

/** Der Anfang der Spanne, in der `datum` liegt: der Montag seiner Woche oder der Erste seines Monats. */
export function spanneVon(takt: PlanTakt, datum: string): string {
  return takt === 'monat' ? monatsErster(datum) : montagVon(datum)
}

/**
 * Die Spannen eines Plans — Wochen als Montage oder Monate als Monatserste, je
 * nach Takt. Die erste ist die, in der er beginnt.
 */
export function planSpannen(plan: Pick<WeitererPlan, 'von' | 'bis' | 'takt'>): string[] {
  const takt = taktVon(plan)
  const naechste = takt === 'monat' ? naechsterMonatsErster : (s: string) => montagNach(s, 1)
  const out: string[] = []
  for (let spanne = spanneVon(takt, plan.von); spanne <= plan.bis; spanne = naechste(spanne)) out.push(spanne)
  return out
}

/** Die Einträge eines Plans, nach Spanne. */
export function eintraegeVon(eintraege: readonly PlanEintrag[], planId: string): PlanEintrag[] {
  return eintraege.filter((e) => e.planId === planId).sort((a, b) => a.datum.localeCompare(b.datum))
}

/**
 * Meint ein Eintrag eine Spanne seines Plans, wie er jetzt steht? Im Zeitraum —
 * es zählt die Spanne, die im Zeitraum beginnt oder in ihn hineinreicht — und
 * im Takt: Ein Montag ist kein Monat.
 */
function passt(plan: WeitererPlan, e: PlanEintrag): boolean {
  const takt = taktVon(plan)
  return e.datum >= spanneVon(takt, plan.von) && e.datum <= plan.bis && spanneVon(takt, e.datum) === e.datum
}

/**
 * Was nach einer Änderung des Plans bleibt: Einträge außerhalb des Zeitraums
 * oder neben dem Takt gehen mit. Einträge anderer Pläne bleiben unberührt —
 * dieselbe Liste, wenn nichts geht.
 */
export function eintraegeImZeitraum(eintraege: PlanEintrag[], plan: WeitererPlan): PlanEintrag[] {
  const bleibt = eintraege.filter((e) => e.planId !== plan.id || passt(plan, e))
  return bleibt.length === eintraege.length ? eintraege : bleibt
}

/**
 * **Den Takt wechseln: dieselbe Reihenfolge, ein anderer Takt.** `plan` trägt
 * schon den neuen Takt; der alte ist der andere der beiden.
 *
 * Ab der laufenden Spanne wird neu verteilt (`gruppenVerteilen`), beginnend
 * mit der Gruppe, die jetzt dran ist — oder als Nächstes. Zuerst stand hier
 * eine Umrechnung Eintrag für Eintrag (ein Monat bekam die Gruppe seiner ersten
 * Woche); aus einem wöchentlich reihum verteilten Plan wurde damit „Gruppe 3,
 * 4, 4, 4" (im Browser gesehen, 4.10.2026). Wer den Takt wechselt, meint die
 * Reihe, nicht die einzelne Woche.
 *
 * Was vorbei ist, geht ins neue Raster über, ohne dass eine Gruppe dazuerfunden
 * wird: Aus einem Monat werden Wochen mit seiner Gruppe; ein Monat bekommt die
 * Gruppe seiner ersten Woche, die eine hat. Gibt es ab jetzt keinen Eintrag
 * (ein Entwurf ohne Einteilung, ein abgelaufener Plan), wird nichts verteilt.
 *
 * Ein Eintrag, dessen Tag bleibt (ein Monatserster, der ein Montag ist),
 * behält seine Kennung: Die Datenbank kennt je Plan und Tag nur einen
 * (`plan_eintraege_woche`).
 */
export function taktWechseln(args: {
  plan: WeitererPlan
  eintraege: readonly PlanEintrag[]
  groups: readonly Group[]
  heute: Date
  neueId: () => string
}): { eintraege: PlanEintrag[]; verteilt: number } {
  const { plan, eintraege, groups, heute, neueId } = args
  const neuerTakt = taktVon(plan)
  const alterTakt: PlanTakt = neuerTakt === 'monat' ? 'woche' : 'monat'
  const andere = eintraege.filter((e) => e.planId !== plan.id)
  const alte = eintraegeVon(eintraege, plan.id).filter((e) => e.grp !== null)
  const jetzt = spanneVon(neuerTakt, isoDay(heute))

  // Was vorbei ist, ins neue Raster.
  const vergangen: PlanEintrag[] = []
  for (const spanne of planSpannen(plan)) {
    if (spanne >= jetzt) break
    const quelle =
      neuerTakt === 'monat'
        ? alte.find((e) => monatsErster(e.datum) === spanne) // die erste Woche des Monats
        : alte.find((e) => e.datum === monatsErster(spanne)) // der Monat der Woche
    if (quelle) vergangen.push(quelle.datum === spanne ? quelle : { id: neueId(), planId: plan.id, datum: spanne, grp: quelle.grp })
  }

  // Wer jetzt dran ist — im alten Takt — oder als Nächstes.
  const dran = alte.find((e) => e.datum >= spanneVon(alterTakt, isoDay(heute)))
  if (!dran?.grp) return { eintraege: [...andere, ...vergangen], verteilt: 0 }
  // Was schon auf einem Tag des neuen Rasters steht, behält seine Kennung.
  const wiederzuverwenden = alte.filter((e) => e.datum >= jetzt && spanneVon(neuerTakt, e.datum) === e.datum)
  return gruppenVerteilen({
    plan,
    eintraege: [...andere, ...vergangen, ...wiederzuverwenden],
    groups,
    abGruppe: dran.grp,
    heute,
    neueId,
  })
}

/**
 * **Reihum verteilen**: die Spannen ab der laufenden bis zum Ende des
 * Zeitraums, die Gruppen in ihrer Reihenfolge, beginnend bei `abGruppe`.
 * Vergangene Spannen bleiben, wie sie sind — sie sind gewesen.
 *
 * Ein Platz behält seine Kennung, wenn er nur eine andere Gruppe bekommt: Die
 * Datenbank kennt je Plan und Spanne genau einen Eintrag
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
  const jetzt = spanneVon(taktVon(plan), isoDay(heute))
  const start = Math.max(0, groups.findIndex((g) => g.id === abGruppe))
  const bleiben = eigene.filter((e) => e.datum < jetzt)
  const neu = planSpannen(plan)
    .filter((s) => s >= jetzt)
    .map((spanne, i): PlanEintrag => {
      const grp = groups[(start + i) % groups.length]!.id
      const da = eigene.find((e) => e.datum === spanne)
      if (da) return da.grp === grp ? da : { ...da, grp }
      return { id: neueId(), planId: plan.id, datum: spanne, grp }
    })
  return { eintraege: [...andere, ...bleiben, ...neu], verteilt: neu.length }
}

/**
 * Die Gruppe einer Spanne setzen oder räumen. Ohne Gruppe geht der Eintrag;
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

/**
 * Steht „Weitere Pläne" im Menü? Für Admin und Planer (`zuteilen`) immer — dort
 * legt der Admin den ersten an, und der Planer verteilt die Gruppen. Sonst,
 * sobald es etwas anzusehen gibt.
 */
export function weiterePlaeneImMenue(args: { plaene: readonly WeitererPlan[]; zuteilen: boolean; heute?: Date }): boolean {
  return args.zuteilen || plaeneZumAnsehen(args.plaene, args.heute).length > 0
}

/** Die Spannen (Wochen oder Monate), in denen eine Gruppe dran ist — für „Deine Gruppe ist dran". */
export function spannenDerGruppe(eintraege: readonly PlanEintrag[], planId: string, grp: string): string[] {
  return eintraegeVon(eintraege, planId)
    .filter((e) => e.grp === grp)
    .map((e) => e.datum)
}
