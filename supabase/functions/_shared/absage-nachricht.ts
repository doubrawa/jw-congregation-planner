// =============================================================================
// Geteilt: die Nachricht einer Absage an die, die planen
// =============================================================================
// Wer absagt, darf dem Planer etwas dazuschreiben (`AbsageBlatt`). Sie steht als
// **ein** Atom am Ende des Rumpfs in der Glocke — „<Aufgabe> — <Name> ·
// <Nachricht>" —, und gebaut wird dieser Rumpf an zwei Stellen: in der App das
// Echo in der eigenen Glocke (`declineTask`), in der Function die Zeilen und
// der Push für alle anderen (`substitute/absage.ts`). Beide fragen hier, damit
// dieselbe Nachricht in beiden Glocken gleich dasteht.
// =============================================================================

/**
 * So lang darf die Nachricht sein. Das Feld im Blatt lässt nicht mehr zu; die
 * Function kürzt, was auf einem anderen Weg länger ankommt.
 */
export const NACHRICHT_MAX = 200

/**
 * Die Nachricht als ein Atom: ohne „ · " darin — der Übersetzer der Glocke
 * teilte sonst an dieser Atomgrenze und bräche die Freitext-Marke —, und
 * höchstens `NACHRICHT_MAX` lang.
 *
 * Gekürzt wird nach Zeichen, nicht nach Code-Einheiten: Ein halbes Zeichenpaar
 * (ein Emoji an der Grenze) nähme die Datenbank nicht an, und die Meldung an
 * alle, die planen, scheiterte an einem Zeichen.
 */
export function absageNachricht(nachricht: string): string {
  return [...nachricht.trim().split(' · ').join(', ')].slice(0, NACHRICHT_MAX).join('')
}
