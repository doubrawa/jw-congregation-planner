import type { ZeichenName } from '../bausteine/Zeichen'
import { darfPlanen, type Rechte } from '../data/rechte'
import type { Screen, Thema } from '../data/types'
import type { Dict } from '../i18n/ui'
import type { AppAction, AppState } from './context'

/** Der Name eines Bereichs — im Menü, über dem Bereich und im Kopf des Planens. */
export function bereichsTitel(t: Dict, thema: Thema): string {
  if (thema === 'predigtdienst') return t.tabFs
  return thema === 'weitere' ? t.navWeiterePlaene : t.navZusammenkuenfte
}

/** Das Zeichen eines Bereichs — im Menü und auf der Wahl von „Planung" (T135, T144). */
export const BEREICHS_ZEICHEN: Record<Thema, ZeichenName> = {
  zusammenkuenfte: 'zusammenkuenfte',
  predigtdienst: 'predigtdienst',
  weitere: 'plaene',
}

/** Die Bereiche in der Reihenfolge des Menüs. */
const BEREICHE: readonly Thema[] = ['zusammenkuenfte', 'predigtdienst', 'weitere']

/** Was jemand planen darf — die Karten der Wahl auf „Planung". */
export const planbareBereiche = (r: Rechte): Thema[] => BEREICHE.filter((thema) => darfPlanen(r, thema))

/**
 * **Gibt es die Wahl auf „Planung"?** Nur, wer mehr als einen Bereich plant.
 * Der Gruppenaufseher plant allein die Treffpunkte seiner Gruppe und kommt
 * gleich hinein.
 */
export const hatPlanungsWahl = (r: Rechte): boolean => planbareBereiche(r).length > 1

/** Einen Bereich ansehen — aus dem Menü, mit „Fertig" und dem Kreuz beim Planen. */
export const zumAnsehen = (thema: Thema): AppAction => ({ type: 'navigate', screen: 'programm', thema })

/**
 * Einen Bereich planen. `von` sagt, woher (T144, `planenVon`): „Planen" neben
 * dem Titel gibt `'ansicht'`, die Wahl auf „Planung" `'planung'` (die Seite
 * der Wochen gibt `'wochen'`, `WochenListe`).
 */
export const zumPlanen = (thema: Thema, von?: NonNullable<AppState['planenVon']>): AppAction => ({
  type: 'navigate',
  screen: 'planen',
  thema,
  ...(von ? { von } : {}),
})

/**
 * **Die Wochen der Zusammenkünfte** — von der Wahl auf „Planung" und mit
 * „Alle Wochen" auf dem Start (T144): Wo neben dem Plan Platz für die Wochen
 * ist (`WOCHEN_SPALTE_BREITE`), gleich in den Plan mit der Spalte daneben,
 * sonst auf die Seite der Wochen. Beides liegt unter „Planung".
 */
export const zuDenWochen = (mitSpalte: boolean): AppAction =>
  mitSpalte ? zumPlanen('zusammenkuenfte', 'planung') : { type: 'navigate', screen: 'wochen' }

/**
 * **Wohin Zurück unter „Planung" führt** (T144, Betreiber: „ist da noch ein
 * genereller ablauffehler?") — eine Ebene hinauf, dorthin, woher man kam: die
 * Seite der Wochen zur Wahl, ein Plan von dort zu den Wochen — auch wenn er bei
 * den Treffpunkten aufging, weil dort das Erste zu tun ist —, jeder andere zur
 * Wahl. Am breiten Bildschirm stehen die Wochen neben dem Plan; dann geht es
 * gleich zur Wahl.
 *
 * `null`: kein Bildschirm unter „Planung", oder das Planen kam nicht von dort
 * (aus der Ansicht, von Start, aus einer Mitteilung), oder es gibt keine Wahl —
 * dann beenden ✕ und „Fertig" es wie bisher und führen in die Ansicht. Bis zum
 * 25.10.2026 galt das für jeden Weg hinein: Planung → Woche → „Fertig" landete
 * in der Ansicht statt bei den Wochen.
 */
export function zurueckInDerPlanung(
  screen: Screen,
  von: AppState['planenVon'],
  r: Rechte,
  mitSpalte: boolean,
): 'planung' | 'wochen' | null {
  // Die Wochen sehen nur Planer — und die haben immer die Wahl.
  if (screen === 'wochen') return 'planung'
  if (screen !== 'planen' || (von !== 'planung' && von !== 'wochen') || !hatPlanungsWahl(r)) return null
  return von === 'wochen' && !mitSpalte ? 'wochen' : 'planung'
}
