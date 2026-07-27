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
 * Ziel-Screen aus einer URL oder einem Hash mit `#go=<screen>` — z. B.
 * `https://…/#go=aufgaben` oder `#go=planen`. Ungültig/keiner → null. Die
 * Erinnerungs-/Ersatz-Benachrichtigungen tragen dieses Ziel im Push-Payload,
 * der Service Worker gibt es beim Antippen an die App weiter (sw.js).
 */
export function parseGoTarget(input: string): Screen | null {
  const hash = input.includes('#') ? input.slice(input.indexOf('#') + 1) : input
  const go = new URLSearchParams(hash).get('go')
  return go && (VALID as readonly string[]).includes(go) ? (go as Screen) : null
}
