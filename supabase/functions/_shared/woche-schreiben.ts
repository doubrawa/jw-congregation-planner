// =============================================================================
// Eine Woche schreiben, solange sie auf dem gelesenen Stand ist
// =============================================================================
// Für jede Edge Function, die eine Woche ändert: `zuteilen` (der Planer teilt
// zu) und `substitute` (ein freier Platz wird übernommen). Dieselbe Regel wie
// `schreibeWoche` im Client (T39): geschrieben wird nur mit der Bedingung
// `updated_at = <Stand>`.
// =============================================================================

import { type Rest, wert } from './rest.ts'

/**
 * Vergleiche-und-Tausche auf `updated_at`; zurück kommt der neue Stand, oder
 * `null`, wenn inzwischen ein anderer geschrieben hat.
 *
 * Trifft der erste Versuch nicht, folgt **ein** zweiter mit derselben
 * Bedingung. Er fängt einen Aussetzer ab (Netz, Zeitüberschreitung) — ein
 * falscher Konfliktalarm verwürfe die Arbeit des Planers oder den Tipp dessen,
 * der einen Platz übernimmt. Hat inzwischen ein anderer geschrieben, trifft
 * auch er nicht, und der Client lädt nach.
 *
 * Bis zum 5.10.2026 stand der Ablauf zweimal da (`zuteilen/woche.ts`,
 * `substitute/fuellen.ts`), und der zweite Versuch schrieb **ohne** Bedingung,
 * sobald beim Nachsehen noch der alte Stand dastand. Schrieb genau zwischen
 * Nachsehen und zweitem Versuch ein anderer, ging seine Änderung lautlos
 * verloren.
 *
 * **Auch ein Netzfehler zählt als verfehlter Versuch.** Ein abgebrochenes
 * `fetch` wirft, statt eine Antwort zu liefern; bis zum 14.10.2026 flog der
 * Wurf hier durch, an der Wiederholung vorbei, und die Function antwortete
 * mit 500. Der Client lädt darauf genauso nach wie bei einem Konflikt — die
 * Arbeit war weg, obwohl der zweite Versuch sie gerettet hätte.
 */
export async function wocheSchreiben(
  rest: Rest,
  cong: string,
  woche: string,
  stand: string,
  data: unknown,
): Promise<string | null> {
  const pfad =
    `weeks?congregation_id=eq.${wert(cong)}&start=eq.${wert(woche)}` +
    `&updated_at=eq.${wert(stand)}&select=updated_at`
  const versuchen = async (): Promise<string | null> => {
    try {
      return (await rest.patchZeilen<{ updated_at: string }>(pfad, { data }))?.[0]?.updated_at ?? null
    } catch (err) {
      console.error('wocheSchreiben:', err instanceof Error ? err.message : String(err))
      return null
    }
  }
  return (await versuchen()) ?? versuchen()
}
