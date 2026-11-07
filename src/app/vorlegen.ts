/**
 * Das Blatt beim Öffnen: ob es etwas vorzulegen hat und welche Ersatzgesuche
 * es zeigt — eine Antwort für den Reducer, die Hülle und das Blatt selbst.
 */

import type { MyTask, SubstituteReq } from '../data/types'

/**
 * Gibt es beim Öffnen etwas vorzulegen? (Bestätigung Pflicht, Einspringen
 * freiwillig — und nur, solange niemand „Nein, danke" gesagt hat.)
 *
 * Eine Stelle für beide Seiten: Der Reducer entscheidet damit, ob `confirmOpen`
 * gesetzt bleibt, und die Hülle, ob sie das Blatt zeigt. Zwei Bedingungen, die
 * dasselbe meinen, laufen früher oder später auseinander — dann steht ein
 * leeres Blatt da oder ein volles bleibt weg.
 */
export function vorzulegen(myTasks: MyTask[], substituteReqs: SubstituteReq[]): boolean {
  return myTasks.some((t) => t.status === 'offen') || vorzulegendeGesuche(substituteReqs).length > 0
}

/** Die Ersatzgesuche, die das Blatt beim Öffnen zeigt: alle ohne „Nein, danke". */
export function vorzulegendeGesuche(substituteReqs: readonly SubstituteReq[]): SubstituteReq[] {
  return substituteReqs.filter((req) => !req.abgelehnt)
}
