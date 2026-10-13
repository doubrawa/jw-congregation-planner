import type { AppState } from '../app/context'
import { geplantesThema, rechteVon } from '../data/rechte'
import type { MeetingKey, SlotSelection } from '../data/types'

/**
 * **Gehört zum Plan die Aktionsleiste?** Zum Plan der Zusammenkünfte, wer
 * zuteilt, sobald es eine Woche gibt — nicht zu „Woche einrichten" und nicht
 * zum Predigtdienst, der seine eigenen Knöpfe hat.
 */
export function mitAktionen(state: AppState): boolean {
  const rechte = rechteVon(state)
  return (
    rechte.zuteilen &&
    state.tab !== 'edit' &&
    geplantesThema(rechte, state.tab) === 'zusammenkuenfte' &&
    state.weeks[state.week] !== undefined
  )
}

/**
 * **Steht das Zuteilen in der Spalte rechts statt im Blatt?** (T121, Entwurf
 * `GDesktopPlanen`) — am Desktop beim Plan der Zusammenkünfte. Dort zeigt
 * `ZuteilenSpalte` die Auswahl, und AppShell öffnet kein Blatt dafür; die
 * Treffpunkte haben keine Spalte und behalten ihr Blatt.
 */
export function zuteilenInSpalte(state: AppState, desktop: boolean): boolean {
  return desktop && state.screen === 'planen' && mitAktionen(state) && state.slotSel?.kind !== 'fs'
}

/** Ein Platz ohne seine Beschriftung — so fragt der Plan, welcher gerade gewählt ist. */
export type PlatzOrt =
  | { kind: 'part'; wi: number; tab: MeetingKey; si: number; ii: number; ni: number; aux?: boolean }
  | { kind: 'helper'; wi: number; tab: MeetingKey; svc: string; pos: number }
  | { kind: 'ratgeber'; wi: number; tab: MeetingKey }

/**
 * **Ist dieser Platz gerade gewählt?** Am Desktop hebt der Plan ihn hervor —
 * die Spalte daneben teilt genau ihn zu.
 */
export function istGewaehlt(sel: SlotSelection | null, ort: PlatzOrt): boolean {
  if (!sel || sel.kind === 'fs' || sel.kind !== ort.kind || sel.wi !== ort.wi || sel.tab !== ort.tab) return false
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
