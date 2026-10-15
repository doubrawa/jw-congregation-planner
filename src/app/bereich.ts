import type { Thema } from '../data/types'
import type { Dict } from '../i18n/ui'
import type { AppAction } from './context'

/** Der Name eines Bereichs — im Menü, über dem Bereich und im Kopf des Planens. */
export function bereichsTitel(t: Dict, thema: Thema): string {
  if (thema === 'predigtdienst') return t.tabFs
  return thema === 'weitere' ? t.navWeiterePlaene : t.navZusammenkuenfte
}

/** Einen Bereich ansehen — aus dem Menü, mit „Fertig" und dem Kreuz beim Planen. */
export const zumAnsehen = (thema: Thema): AppAction => ({ type: 'navigate', screen: 'programm', thema })

/** Einen Bereich planen — mit „Planen" am Titel und über „Planung" im Menü. */
export const zumPlanen = (thema: Thema): AppAction => ({ type: 'navigate', screen: 'planen', thema })

/**
 * **„Planung"** für den, der zuteilt — aus dem Menü und mit „Alle Wochen" auf
 * dem Start (T121, Phase 10): Wo neben dem Plan Platz für die Wochen ist
 * (`WOCHEN_SPALTE_BREITE`), gleich in den Plan der Zusammenkünfte mit der
 * Spalte daneben, sonst auf die Seite aller Wochen.
 */
export const zurPlanung = (mitSpalte: boolean): AppAction =>
  mitSpalte ? zumPlanen('zusammenkuenfte') : { type: 'navigate', screen: 'planung' }
