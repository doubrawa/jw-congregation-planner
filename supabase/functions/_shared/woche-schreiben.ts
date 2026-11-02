// =============================================================================
// Eine Woche schreiben, solange sie auf dem gelesenen Stand ist
// =============================================================================
// Für jede Edge Function, die eine Woche ändert: `substitute` (ein freier Platz
// wird übernommen) und `tauschen` (zwei Plätze in einer Woche; zwei Wochen
// gehen zusammen über `wochen_tauschen`). Dieselbe Regel wie `schreibeWoche` im
// Client (T39): geschrieben wird nur mit der Bedingung `updated_at = <Stand>`.
// =============================================================================

import { gleicherInhalt } from './gleicher-inhalt.ts'
import { type Rest, wert } from './rest.ts'

/**
 * Vergleiche-und-Tausche auf `updated_at`; zurück kommt der neue Stand, oder
 * `null`, wenn inzwischen ein anderer geschrieben hat.
 *
 * Trifft der erste Versuch nicht, folgt **ein** zweiter mit derselben
 * Bedingung — nie ohne sie, sonst ginge lautlos verloren, was ein anderer
 * zwischen den beiden Versuchen geschrieben hat. Er fängt einen Aussetzer ab
 * (Netz, Zeitüberschreitung; auch ein Netzfehler zählt als verfehlter
 * Versuch): Ein falscher Konfliktalarm verwürfe die Arbeit des Planers oder
 * den Tipp dessen, der einen Platz übernimmt.
 *
 * Verfehlt auch der zweite, wird nachgesehen: Steht in der Woche schon, was
 * geschrieben werden sollte, ist es geschrieben. So endet ein erster Versuch,
 * der ankam, dessen Antwort aber unterwegs verloren ging — der zweite verfehlt
 * dann den neuen Stand, den der erste selbst gesetzt hat.
 */
export async function wocheSchreiben(
  rest: Rest,
  cong: string,
  woche: string,
  stand: string,
  data: unknown,
): Promise<string | null> {
  const zeile = `weeks?congregation_id=eq.${wert(cong)}&start=eq.${wert(woche)}`
  const pfad = `${zeile}&updated_at=eq.${wert(stand)}&select=updated_at`
  const versuchen = async (): Promise<string | null> => {
    try {
      return (await rest.patchZeilen<{ updated_at: string }>(pfad, { data }))?.[0]?.updated_at ?? null
    } catch (err) {
      console.error('wocheSchreiben:', err instanceof Error ? err.message : String(err))
      return null
    }
  }
  return (await versuchen()) ?? (await versuchen()) ?? (await schonGeschrieben(rest, zeile, data))
}

/** Der Stand der Woche, wenn sie schon enthält, was geschrieben werden sollte — sonst `null`. */
async function schonGeschrieben(rest: Rest, zeile: string, data: unknown): Promise<string | null> {
  try {
    const [jetzt] = await rest.get<{ updated_at: string; data: unknown }[]>(`${zeile}&select=updated_at,data`)
    // Verglichen wird, was als JSON hinausging: Ein `undefined` kommt dort gar nicht erst an.
    return jetzt && gleicherInhalt(jetzt.data, JSON.parse(JSON.stringify(data))) ? jetzt.updated_at : null
  } catch (err) {
    console.error('wocheSchreiben, Nachsehen:', err instanceof Error ? err.message : String(err))
    return null
  }
}
