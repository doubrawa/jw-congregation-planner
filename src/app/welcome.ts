import type { DataStatus } from './context'

/**
 * Soll nach dem Anmelden begrüßt werden — und mit welchem Namen?
 *
 * Beim Anmelden ist nur das Konto bekannt; der Name kommt erst mit den
 * Personendaten. Deshalb wird die Begrüßung vorgemerkt (`welcomePending`) und
 * diese Entscheidung erst getroffen, wenn das Laden durch ist.
 *
 * Drei Ausgänge, die sich leicht verwechseln lassen:
 *
 *  - `warten`   — noch nichts tun, die Vormerkung bleibt stehen.
 *  - `verwerfen`— nicht begrüßen, Vormerkung aber abräumen. Sonst poppt die
 *                 Begrüßung später zu einem willkürlichen Zeitpunkt auf, etwa
 *                 sobald irgendwann Personendaten eintreffen.
 *  - `{ name }` — begrüßen.
 *
 * Ohne zugehörige Person (ein Konto, das der Admin aus der Versammlung
 * genommen hat, oder Laden fehlgeschlagen) wird bewusst gar nicht begrüßt: eine
 * namenlose Begrüßung wäre kein Ersatz, und diese Bildschirme haben Wichtigeres
 * zu sagen — dass ein neuer Link nötig ist, oder ein Fehler.
 */
export type WelcomeDecision = 'warten' | 'verwerfen' | { name: string }

export function welcomeDecision(
  pending: boolean,
  status: DataStatus,
  firstName: string | undefined,
): WelcomeDecision {
  if (!pending) return 'warten' // nichts vorgemerkt
  if (status === 'loading') return 'warten' // Name kann noch kommen
  return firstName ? { name: firstName } : 'verwerfen'
}
