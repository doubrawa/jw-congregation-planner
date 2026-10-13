import type { AppState } from '../app/context'
import { darfPlanen, geplantesThema, rechteVon } from '../data/rechte'
import type { MeetingKey, SlotSelection } from '../data/types'
import { aktiverFsBereich } from './fs-bereiche'

/**
 * Welche Aktionsleiste ein Plan trägt: die der Zusammenkünfte oder die der
 * Treffpunkte einer Woche (T121, Phase 5e).
 */
export type PlanArt = 'zusammenkuenfte' | 'treffpunkte'

/**
 * **Gehört zum Plan die Aktionsleiste — und welche?** Sobald es eine Woche
 * gibt:
 *
 * - zum Plan der **Zusammenkünfte** für den, der zuteilt — nicht zu „Woche
 *   einrichten";
 * - zu den **Treffpunkten der Woche** für den, der zuteilt, und für den
 *   Gruppenaufseher, der die Treffpunkte seiner Gruppe besetzt. Die übrigen
 *   Reiter des Predigtdienstes (Besuche, Zeugnisgeben, Grundplan) haben keine
 *   Woche und keine Leiste.
 */
export function planArt(state: AppState): PlanArt | null {
  if (state.weeks[state.week] === undefined) return null
  const rechte = rechteVon(state)
  const thema = geplantesThema(rechte, state.tab)
  if (!darfPlanen(rechte, thema)) return null
  if (thema === 'zusammenkuenfte') return state.tab !== 'edit' ? 'zusammenkuenfte' : null
  return thema === 'predigtdienst' && aktiverFsBereich(state) === 'treffpunkte' ? 'treffpunkte' : null
}

/**
 * **Steht das Zuteilen in der Spalte rechts statt im Blatt?** (T121, Entwurf
 * `GDesktopPlanen`) — am Desktop bei einem Plan mit Leiste. Dort zeigt
 * `ZuteilenSpalte` die Auswahl, und AppShell öffnet kein Blatt dafür.
 */
export function zuteilenInSpalte(state: AppState, desktop: boolean): boolean {
  return desktop && state.screen === 'planen' && planArt(state) !== null
}

/**
 * **Gehört die Auswahl zum Plan, der gerade zu sehen ist?** Dieselbe Woche,
 * dieselbe Zusammenkunft, oder ein Treffpunkt beim Plan der Treffpunkte. Nach
 * einem Wechsel stünde in der Spalte sonst ein Platz, den man nirgends sieht.
 */
export function auswahlImPlan(state: AppState, sel: SlotSelection | null): boolean {
  if (!sel || sel.wi !== state.week) return false
  const art = planArt(state)
  return sel.kind === 'fs' ? art === 'treffpunkte' : art === 'zusammenkuenfte' && sel.tab === state.tab
}

/** Ein Platz ohne seine Beschriftung — so fragt der Plan, welcher gerade gewählt ist. */
export type PlatzOrt =
  | { kind: 'part'; wi: number; tab: MeetingKey; si: number; ii: number; ni: number; aux?: boolean }
  | { kind: 'helper'; wi: number; tab: MeetingKey; svc: string; pos: number }
  | { kind: 'ratgeber'; wi: number; tab: MeetingKey }
  | { kind: 'fs'; wi: number; instId: string }

/**
 * **Ist dieser Platz gerade gewählt?** Am Desktop hebt der Plan ihn hervor —
 * die Spalte daneben teilt genau ihn zu.
 */
export function istGewaehlt(sel: SlotSelection | null, ort: PlatzOrt): boolean {
  if (!sel || sel.kind !== ort.kind || sel.wi !== ort.wi) return false
  if (sel.kind === 'fs' || ort.kind === 'fs') return sel.kind === 'fs' && ort.kind === 'fs' && sel.instId === ort.instId
  if (sel.tab !== ort.tab) return false
  switch (ort.kind) {
    case 'part':
      return (
        sel.kind === 'part' &&
        sel.si === ort.si &&
        sel.ii === ort.ii &&
        sel.ni === ort.ni &&
        (sel.aux === true) === (ort.aux === true)
      )
    case 'helper':
      return sel.kind === 'helper' && sel.svc === ort.svc && sel.pos === ort.pos
    case 'ratgeber':
      return true
  }
}
