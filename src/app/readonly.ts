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
  // Die Freigabe-Liste eines Dienstes ansehen. Die Schalter **darin** sind
  // `updatePerson` und bleiben gesperrt; das Öffnen selbst ist Nachschlagen.
  // Ohne diese beiden ließ sie sich offline weder aufschlagen noch — hätte sie
  // schon offen gestanden — wieder zumachen.
  'openServiceSheet',
  'closeServiceSheet',
  /*
   * **Das Blatt beim Öffnen weglegen.**
   *
   * `closeConfirm` schreibt nichts; es räumt nur `confirmOpen` weg, und auch
   * das nur, solange keine Aufgabe offen ist (die Pflicht bleibt, siehe
   * Reducer). Gesperrt war es trotzdem — und damit saß der Nutzer fest: Steht
   * allein ein Ersatzgesuch da, ist der Klick auf den Hintergrund der einzige
   * Weg heraus (kein ✕, kein Escape). Offline führte er zu einem Hinweis
   * „nur lesen", und das Blatt blieb liegen. Ausgerechnet dort, wo es nichts
   * zu bestätigen gab.
   */
  'closeConfirm',
  /*
   * Frisch geholte Glocken-Zeilen anzeigen (`NotificationsPanel`). Das ist
   * gelesen, nicht geschrieben — `persist` kennt die Aktion gar nicht. Gesperrt
   * wurden dadurch genau die Zeilen verworfen, die gerade eingetroffen waren,
   * und statt ihrer erschien ein „nur lesen"-Hinweis auf das bloße Aufklappen
   * der Glocke.
   */
  'setNotifs',
  // Die eigene Aufgabe ansehen. Erst Bestätigen/Absagen darin schreibt —
  // ohne diese beiden ließ sich offline nicht einmal nachschlagen, was
  // ansteht, also genau das, wofür der Offline-Stand da ist.
  'openMyTask',
  'closeMyTask',
  // Vermerk, dass die Begrüßung gezeigt wurde. Rein lokal; fehlte sie hier,
  // begrüßte der Offline-Start mit einem „nur lesend"-Hinweis.
  'welcomeShown',
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
