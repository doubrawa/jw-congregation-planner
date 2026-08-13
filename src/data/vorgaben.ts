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
  { key: 'ord', name: 'Eingangsordner', count: 1, groups: false },
  { key: 'saal', name: 'Saalordner', count: 1, groups: false },
  { key: 'rund', name: 'Rundgangsordner', count: 1, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/**
 * Erinnerungs-Vorgaben: erste Erinnerung sieben Tage vorher, letzte einen Tag
 * vorher, dazwischen wiederholt. Sie greifen, solange eine Versammlung in
 * `congregations.settings` nichts Eigenes stehen hat — also auch für jede
 * bestehende, die die Einstellung nie angefasst hat.
 */
export const STANDARD_ERINNERUNGEN: Reminders = { first: 7, last: 1, repeat: true }
