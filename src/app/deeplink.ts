import type { Screen } from '../data/types'

/** Screens, auf die ein Push-Klick verlinken darf (kein `login`). */
const VALID: readonly Screen[] = [
  'start',
  'programm',
  'aufgaben',
  'planen',
  'personen',
  'einstellungen',
  'profil',
]

/**
 * Ein Bereich innerhalb eines Screens, zu dem ein Push-Klick springt.
 *
 * Bisher gibt es genau einen: **Einspringen** auf „Meine Aufgaben" (T109). Der
 * Bereich steht dort unten und nur, solange ein Gesuch offen ist; wer auf
 * „Ersatz gesucht" tippte, landete oben auf der Seite und musste ihn suchen.
 * Eine eigene Seite dafür hat der Betreiber verworfen — sie wäre fast immer
 * leer. Gesprungen wird stattdessen dorthin, wo das Gesuch schon steht.
 */
export type Abschnitt = 'einspringen'

/** Jeder Bereich gehört zu genau einem Screen; anderswo gibt es ihn nicht. */
const ABSCHNITT_AUF: Readonly<Record<Abschnitt, Screen>> = {
  einspringen: 'aufgaben',
}

function hashParameter(input: string): URLSearchParams {
  const hash = input.includes('#') ? input.slice(input.indexOf('#') + 1) : input
  return new URLSearchParams(hash)
}

/**
 * Ziel-Screen aus einer URL oder einem Hash mit `#go=<screen>` — z. B.
 * `https://…/#go=aufgaben` oder `#go=planen`. Ungültig/keiner → null. Die
 * Erinnerungs-/Ersatz-Benachrichtigungen tragen dieses Ziel im Push-Payload,
 * der Service Worker gibt es beim Antippen an die App weiter (sw.js).
 */
export function parseGoTarget(input: string): Screen | null {
  const go = hashParameter(input).get('go')
  return go && (VALID as readonly string[]).includes(go) ? (go as Screen) : null
}

/**
 * Bereich, zu dem der Klick springen soll: `#go=aufgaben&abschnitt=einspringen`.
 *
 * Nur, wenn er zum Screen des Links gehört — `#go=programm&abschnitt=einspringen`
 * springt nirgendwohin, statt auf einem Screen nach einem Bereich zu suchen, den
 * es dort nicht gibt. Ein Link ohne Zusatz (alle bisherigen Pushes, auch die noch
 * auf einem Gerät liegen) ergibt null und öffnet den Screen wie gehabt oben.
 */
export function parseGoAbschnitt(input: string): Abschnitt | null {
  const p = hashParameter(input)
  const abschnitt = p.get('abschnitt')
  if (!abschnitt || !Object.hasOwn(ABSCHNITT_AUF, abschnitt)) return null
  return ABSCHNITT_AUF[abschnitt as Abschnitt] === parseGoTarget(input) ? (abschnitt as Abschnitt) : null
}
