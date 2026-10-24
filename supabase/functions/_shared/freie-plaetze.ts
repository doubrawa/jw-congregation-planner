// =============================================================================
// Geteilt: welche freien Plätze man selbst übernehmen kann (4.10.2026)
// =============================================================================
// Eine Regel, zwei Fragesteller: Der Client zeigt die Plätze unter „Freie
// Plätze" an (`src/data/offene-plaetze.ts`), die Edge Function `substitute`
// trägt ein (Aufruf 'fill', `substitute/fuellen.ts`). Liefen beide
// auseinander, böte die App einen Platz an, den der Server abweist — oder der
// Server nähme einen, den die App nie angeboten hätte.
//
// **Nur Hilfsdienste** (Betreiber, 25.10.2026: „freie plätze dürfen nur
// hilfsdienste betreffen. aufgaben weist der planer zu"). Bis dahin bot die App
// auch Programmpunkte und den Ratgeber der Zusätzlichen Klasse an — ohne
// Redner- und Schulungsplätze, den Vortrag des Vorsitzenden und das
// Schlussgebet am Wochenende. Dass ein Platz ein Hilfsdienst ist, steht im
// Schlüssel (`art: 'helper'`); beide Seiten prüfen das zuerst.
// =============================================================================

/**
 * Unter welchem Aufgabenbereich ein freier Platz dieses Hilfsdienstes
 * angeboten wird — `null`: gar nicht. Die Reinigung nicht: Sie übernimmt eine
 * Gruppe, keine Person (`groups`). Der Bereich ist der des Dienstes, wie ihn
 * die Personen tragen (`serviceQualKey` im Client).
 */
export function angebotsBereich(svc: { key: string; groups?: boolean }): string | null {
  return svc.groups ? null : `svc:${svc.key}`
}
