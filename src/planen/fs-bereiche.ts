/**
 * Welche Reiter der Predigtdienst hat (T120) — eine Antwort für die Leiste
 * (`FsBereichTabs`) und die Bildschirme, die nach dem Bereich verzweigen
 * (`PlanenScreen`, `ProgrammScreen`).
 */

import type { AppState } from '../app/context'
import { besuchsLage, besuchStand } from '../data/gruppenbesuche'
import { isoDay, montagVon } from '../data/meeting-dates'
import { rechteVon } from '../data/rechte'
import type { FsBereich } from '../data/types'

/**
 * Gibt es einen Gruppenbesuch, der noch kommt? Was vor dieser Woche liegt, ist
 * vorbei, ohne dass man nachrechnet — die Liste wächst mit den Jahren, und
 * gefragt wird bei jedem Render des Predigtdienstes.
 */
function kuenftigeBesuche(state: AppState, heute = new Date()): boolean {
  const dieseWoche = montagVon(isoDay(heute))
  const lage = besuchsLage(state)
  return state.gruppenbesuche.some((b) => b.woche >= dieseWoche && besuchStand(b, lage, heute).art !== 'vorbei')
}

/**
 * Die Bereiche des Predigtdienstes, die hier zu sehen sind.
 *
 * - **Treffpunkte** immer.
 * - **Gruppenbesuche** beim Planen für Admin und Planer (der Planer plant sie
 *   seit dem 15.10.2026 ganz; davor wechselte er nur den Besucher); der
 *   Gruppenaufseher plant sie nicht (so auch die Datenbank). Beim Ansehen für alle, sobald einer
 *   ansteht: Die Gruppe soll wissen, wann der Dienstaufseher kommt; ohne Besuch
 *   bliebe dort nur ein leerer Reiter.
 * - **Trolleys** (T121, Phase 7) nur beim Ansehen, sobald die Versammlung
 *   einen hat — für alle: So sehen alle, wann ein Trolley unterwegs ist.
 *   Planen gibt es dort nichts; wer das Trolley-Recht hat, trägt sich selbst
 *   ein.
 * - **Grundplan** nur beim Planen, und nur für den, der ihn ändern darf: Admin
 *   und Planer ganz, der Gruppenaufseher seine Gruppe.
 */
export function fsBereiche(state: AppState): FsBereich[] {
  const planen = state.screen === 'planen'
  const rechte = rechteVon(state)
  const besuche = planen ? rechte.zuteilen : kuenftigeBesuche(state)
  const trolleys = !planen && state.trolleys.length > 0
  const grundplan = planen && (rechte.zuteilen || rechte.gruppe !== null)
  return [
    'treffpunkte',
    ...(besuche ? (['gruppenbesuche'] as const) : []),
    ...(trolleys ? (['trolleys'] as const) : []),
    ...(grundplan ? (['grundplan'] as const) : []),
  ]
}

/** Der Bereich, der gerade gilt — einer, den es hier nicht gibt, zählt als „Treffpunkte". */
export function aktiverFsBereich(state: AppState): FsBereich {
  return fsBereiche(state).includes(state.fsBereich) ? state.fsBereich : 'treffpunkte'
}
