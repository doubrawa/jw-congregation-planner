/**
 * **Wer darf welchen Bildschirm sehen.**
 *
 * Eine einzige Antwort für zwei Fragesteller: die Navigation (`AppShell`)
 * blendet danach ein, der Reducer (`navigate`) lässt danach durch. Solange das
 * zwei Fassungen waren — eine Liste dort, eine Ausschlussbedingung hier —,
 * konnten sie auseinanderlaufen: Die Navigation zeigte dann einen Eintrag, den
 * der Reducer beim Antippen sofort wieder auf „Programm" umlenkte. Nichts
 * schlug fehl, es sah nur kaputt aus.
 *
 * `aufseherGruppe` (helpers.ts) beantwortet die Vorfrage „ist jemand
 * Gruppenaufseher?" — sie gehört zu den Gruppen, nicht zu den Rechten.
 */

import type { Screen } from './types'

/** Reihenfolge = Reihenfolge in der Navigation. */
const ALLE: readonly Screen[] = [
  'start',
  'programm',
  'aufgaben',
  'planen',
  'personen',
  'einstellungen',
  'profil',
]

/** Bildschirme, die ein einfacher Verkündiger nicht sieht. */
const NUR_PLANER: readonly Screen[] = ['planen', 'personen', 'einstellungen']

/**
 * Die Bildschirme, die jemand sehen darf — in der Reihenfolge der Navigation.
 *
 * Ein Gruppenaufseher (Aufseher oder Gehilfe einer Gruppe, ohne volle
 * Planer-Rechte) bekommt Planen + Einstellungen dazu, dort aber nur die
 * Treffpunkte seiner eigenen Gruppe; Personen bleibt ihm verschlossen.
 */
export function erlaubteScreens(planner: boolean, fsAufseher: boolean): readonly Screen[] {
  if (planner) return ALLE
  if (fsAufseher) return ALLE.filter((s) => s !== 'personen')
  return ALLE.filter((s) => !NUR_PLANER.includes(s))
}
