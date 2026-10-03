/**
 * Welche Reiter der Predigtdienst hat (T120) — eine Antwort für die Leiste
 * (`FsBereichTabs`) und die Bildschirme, die nach dem Bereich verzweigen
 * (`PlanenScreen`, `ProgrammScreen`).
 */

import type { AppState } from '../app/context'
import { besuchsLage, besuchStand } from '../data/gruppenbesuche'
import { isoDay, montagVon } from '../data/meeting-dates'
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
 * - **Gruppenbesuche** beim Planen nur für Planer — der Gruppenaufseher plant
 *   sie nicht (so auch die Datenbank). Beim Ansehen für alle, sobald einer
 *   ansteht: Die Gruppe soll wissen, wann der Dienstaufseher kommt; ohne Besuch
 *   bliebe dort nur ein leerer Reiter.
 * - **Öffentliches Zeugnisgeben** beim Planen nur für Planer (die
 *   Ältestenschaft organisiert es), beim Ansehen für alle, sobald es Termine
 *   gibt — dort trägt man sich ein.
 * - **Grundplan** nur beim Planen.
 */
export function fsBereiche(state: AppState): FsBereich[] {
  const planen = state.screen === 'planen'
  const besuche = planen ? state.planner : kuenftigeBesuche(state)
  const zeugnis = planen ? state.planner : state.ozTermine.length > 0
  return [
    'treffpunkte',
    ...(besuche ? (['gruppenbesuche'] as const) : []),
    ...(zeugnis ? (['zeugnis'] as const) : []),
    ...(planen ? (['grundplan'] as const) : []),
  ]
}

/** Der Bereich, der gerade gilt — einer, den es hier nicht gibt, zählt als „Treffpunkte". */
export function aktiverFsBereich(state: AppState): FsBereich {
  return fsBereiche(state).includes(state.fsBereich) ? state.fsBereich : 'treffpunkte'
}
