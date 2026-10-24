import { ANSTEUERBARE_SCREENS } from '../data/rechte'
import type { Screen } from '../data/types'

/**
 * Screens, auf die ein Push-Klick verlinken darf: jeder außer `login` — die
 * Liste aus `rechte.ts`, die `ZUGANG` vollständig hält. Hier stand bis zum
 * 17.10.2026 eine eigene Aufzählung; ihr fehlte die Auswertung (T126), solange
 * sie eine bloße Liste war.
 */
const VALID: readonly Screen[] = ANSTEUERBARE_SCREENS

/**
 * Ein Bereich innerhalb eines Screens, zu dem ein Push-Klick springt.
 *
 * Bisher gibt es genau einen: **Einspringen** (T109), seit dem 24.10.2026 auf
 * „Freie Plätze" (T134, vorher unten auf „Meine Aufgaben"). Der Bereich steht
 * nur, solange ein Gesuch offen ist; wer auf „Ersatz gesucht" tippte, landete
 * oben auf der Seite und musste ihn suchen. Gesprungen wird dorthin, wo das
 * Gesuch steht.
 */
export type Abschnitt = 'einspringen'

/** Jeder Bereich gehört zu genau einem Screen; anderswo gibt es ihn nicht. */
const ABSCHNITT_AUF: Readonly<Record<Abschnitt, Screen>> = {
  einspringen: 'freie',
}

/**
 * Wo ein Bereich **früher** stand: Pushes, die schon auf einem Gerät liegen,
 * tragen noch dieses Ziel (`#go=aufgaben&abschnitt=einspringen`). Sie führen
 * zum Bereich, wo er heute steht.
 */
const FRUEHER_AUF: Readonly<Record<Abschnitt, Screen>> = {
  einspringen: 'aufgaben',
}

function abschnittVon(p: URLSearchParams): Abschnitt | null {
  const abschnitt = p.get('abschnitt')
  return abschnitt && Object.hasOwn(ABSCHNITT_AUF, abschnitt) ? (abschnitt as Abschnitt) : null
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
  const p = hashParameter(input)
  const go = p.get('go')
  if (!go || !(VALID as readonly string[]).includes(go)) return null
  const abschnitt = abschnittVon(p)
  return abschnitt && FRUEHER_AUF[abschnitt] === go ? ABSCHNITT_AUF[abschnitt] : (go as Screen)
}

/**
 * Bereich, zu dem der Klick springen soll: `#go=freie&abschnitt=einspringen`.
 *
 * Nur, wenn er zum Screen des Links gehört — oder dort früher stand
 * (`FRUEHER_AUF`). `#go=programm&abschnitt=einspringen`
 * springt nirgendwohin, statt auf einem Screen nach einem Bereich zu suchen, den
 * es dort nicht gibt. Ein Link ohne Zusatz (alle bisherigen Pushes, auch die noch
 * auf einem Gerät liegen) ergibt null und öffnet den Screen wie gehabt oben.
 */
export function parseGoAbschnitt(input: string): Abschnitt | null {
  const abschnitt = abschnittVon(hashParameter(input))
  return abschnitt && ABSCHNITT_AUF[abschnitt] === parseGoTarget(input) ? abschnitt : null
}
