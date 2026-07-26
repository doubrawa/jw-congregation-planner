/**
 * Welche Aktionen sind im Offline-Stand erlaubt?
 *
 * Zeigt die App die Offline-Momentaufnahme (staleAt gesetzt), kann nichts
 * gespeichert werden — Supabase ist ja nicht erreichbar. Änderungen würden im
 * UI erscheinen und beim nächsten Laden verschwinden. Der Provider weist sie
 * deshalb ab (store.tsx) und zeigt einen Hinweis.
 *
 * Bewusst eine Positivliste der reinen Ansichts-Aktionen: eine später ergänzte
 * Aktion gilt damit automatisch als Schreibzugriff und wird blockiert, statt
 * still Daten zu verlieren.
 */

import type { AppAction } from './context'

const VIEW_ACTIONS: ReadonlySet<AppAction['type']> = new Set([
  // Sitzung / Hydration
  'login',
  'logout',
  'hydrate',
  'setDataStatus',
  'setRecovery',
  // Navigation
  'navigate',
  'prevWeek',
  'nextWeek',
  'setTab',
  // Ansichten öffnen/schließen (das Zuteilungs-Sheet zeigt auch Verfügbarkeiten;
  // erst das eigentliche `assign` ist ein Schreibzugriff)
  'openSlot',
  'closeSlot',
  'openNotifs',
  'closeNotifs',
  'selectPerson',
  'openS89',
  'closeS89',
  'openLangSheet',
  'closeLangSheet',
  'setLangSearch',
  'stopImport',
  // Rein lokale Vorlieben (localStorage, keine Versammlungsdaten)
  'setTheme',
  'setFontScale',
  'setLang',
  // Rückmeldungen
  'showToast',
  'hideToast',
])

/** true, wenn die Aktion nichts an den Versammlungsdaten ändert. */
export function isViewAction(type: AppAction['type']): boolean {
  return VIEW_ACTIONS.has(type)
}
