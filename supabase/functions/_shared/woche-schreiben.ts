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
  const versuchen = async (): Promise<string | null> =>
    (await rest.patchZeilen<{ updated_at: string }>(pfad, { data }))?.[0]?.updated_at ?? null
  return (await versuchen()) ?? versuchen()
}
