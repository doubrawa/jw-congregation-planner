/**
 * Welche Reiter der Predigtdienst hat (T120) — eine Antwort für die Leiste
 * (`FsBereichTabs`) und die Bildschirme, die nach dem Bereich verzweigen
 * (`PlanenScreen`, `ProgrammScreen`).
 */

import type { AppState } from '../app/context'
import { besuchStand } from '../data/gruppenbesuche'
import type { FsBereich } from '../data/types'

/** Gibt es einen Gruppenbesuch, der noch kommt? */
function kuenftigeBesuche(state: AppState): boolean {
  const lage = {
    kennungen: state.weeks.map((w) => w.start),
    fsWeeks: state.fsWeeks,
    fsRules: state.fsRules,
    absences: state.absences,
  }
  return state.gruppenbesuche.some((b) => besuchStand(b, lage).art !== 'vorbei')
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
