/**
 * Voreinstellungen einer Versammlung — **keine Demo-Daten**.
 *
 * Beides stand bis zum 13. August 2026 in `demo.ts` und wurde von dort aus
 * produktiv benutzt: die Erinnerungs-Vorgaben bei *jedem* Laden, die Dienste
 * beim Anlegen einer Versammlung. Der Dateiname behauptete damit etwas
 * Falsches — und wer `demo.ts` aufräumte, hätte Produktivverhalten geändert,
 * ohne es zu merken.
 *
 * Was hier steht, ist der Zustand, in dem eine frisch angelegte Versammlung
 * beginnt. Alles davon ist danach in den Einstellungen änderbar.
 */

import type { Reminders, Service } from './types'

/**
 * Regeltermine, mit denen eine Versammlung beginnt: Dienstag 19:00 und Sonntag
 * 10:00 (Wochentag als Zahl, 0 = Sonntag … 6 = Samstag).
 *
 * **Aus dem geteilten Modul**, nicht hier noch einmal geschrieben: Dieselbe
 * Vorgabe brauchen die Edge Functions, und zwei Fassungen hießen, dass die App
 * einen Tag anzeigt und die Erinnerung einen anderen nennt. Dieselben Werte
 * stehen als `default` in `congregations` (schema.sql).
 */
export { STANDARD_ZEITEN } from '../../supabase/functions/_shared/planung.ts'

/**
 * Hilfsdienste, die jede Versammlung zunächst bekommt.
 *
 * `count` ist die Zahl der Plätze, `groups` bedeutet „reihum durch die
 * Predigtdienstgruppen" statt namentlicher Zuteilung — das trifft auf die
 * Reinigung zu und sonst auf nichts.
 */
export const STANDARD_DIENSTE: Service[] = [
  { key: 'ton', name: 'Ton / Video', count: 1, groups: false },
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'zoom', name: 'Zoom-Ordner', count: 1, groups: false },
  { key: 'eingang', name: 'Eingangsordner', count: 1, groups: false },
  { key: 'saal', name: 'Saalordner', count: 1, groups: false },
  { key: 'rund', name: 'Rundgangsordner', count: 1, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/**
 * Erinnerungs-Vorgaben: erste Erinnerung sieben Tage vorher, letzte einen Tag
 * vorher — und **dazwischen nichts**. Dieselben Werte stehen als `default` in
 * `congregations` (schema.sql); `edge-parity.test.ts` hält beide zusammen.
 *
 * `repeat` stand hier auf `true` und war damit die lauteste Voreinstellung der
 * App: Wer nicht bestätigte, bekam sieben Tage in Folge einen Push für dieselbe
 * Sache — an fünf dieser Tage ohne jeden neuen Inhalt, denn die Glocke bekommt
 * nur an `first` und `last` eine Zeile. Zwei Anstöße für eine Zuteilung sind
 * genug; wer dann noch nicht reagiert hat, wird ohnehin den Planern gemeldet
 * („nicht erreichbar"), und der spricht persönlich mit ihm.
 *
 * Der Schalter bleibt — eine Versammlung, die es anders will, stellt ihn an.
 * Geändert hat sich nur, was gilt, wenn niemand etwas einstellt.
 */
export const STANDARD_ERINNERUNGEN: Reminders = { first: 7, last: 1, repeat: false }
