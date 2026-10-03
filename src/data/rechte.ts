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

import type { MeetingTab, Screen, Thema } from './types'

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
 * Die Bildschirme, die jemand sehen darf.
 *
 * Ein Gruppenaufseher (Aufseher oder Gehilfe einer Gruppe, ohne volle
 * Planer-Rechte) bekommt Planen dazu, dort aber nur die Treffpunkte seiner
 * eigenen Gruppe samt ihrem Grundplan. Die Einstellungen brauchte er bis T120
 * nur für diesen Grundplan; der steht seitdem im Predigtdienst. Personen und
 * Einstellungen bleiben ihm verschlossen.
 */
export function erlaubteScreens(planner: boolean, fsAufseher: boolean): readonly Screen[] {
  if (planner) return ALLE
  if (fsAufseher) return ALLE.filter((s) => s !== 'personen' && s !== 'einstellungen')
  return ALLE.filter((s) => !NUR_PLANER.includes(s))
}

/**
 * Das Thema, zu dem ein Reiter gehört: die Treffpunkte zum Predigtdienst, die
 * Weiteren Pläne zu sich selbst (T120, Phase 5), alles andere zu den
 * Zusammenkünften.
 */
export function themaVon(tab: MeetingTab): Thema {
  if (tab === 'fs') return 'predigtdienst'
  return tab === 'wp' ? 'weitere' : 'zusammenkuenfte'
}

/**
 * Darf jemand dieses Thema **planen** — sieht er also den Schalter
 * Ansehen/Planen?
 *
 * Der Planer plant alles. Der Gruppenaufseher plant nur den Predigtdienst, und
 * dort nur seine Gruppe (die Einschränkung trägt `PlanenScreen`); eine
 * Zusammenkunft plant er nicht. Alle anderen sehen keinen Schalter.
 */
export function darfPlanen(planner: boolean, fsAufseher: boolean, thema: Thema): boolean {
  return planner || (fsAufseher && thema === 'predigtdienst')
}
