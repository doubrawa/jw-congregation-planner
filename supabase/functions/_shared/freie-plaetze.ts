// =============================================================================
// Geteilt: welche freien Plätze man selbst übernehmen kann (4.10.2026)
// =============================================================================
// Eine Regel, zwei Fragesteller: Der Client zeigt die Plätze unter „Meine
// Aufgaben" an (`src/data/offene-plaetze.ts`), die Edge Function `substitute`
// trägt ein (Aufruf 'fill', `substitute/fuellen.ts`). Liefen beide
// auseinander, böte die App einen Platz an, den der Server abweist — oder der
// Server nähme einen, den die App nie angeboten hätte.
// =============================================================================

import { SKIP_ROLE } from './planung.ts'

/**
 * Bereiche der **Schulungsaufgaben** — die werden nicht angeboten (Betreiber,
 * 4.10.2026): Der Aufseher teilt sie bewusst zu, mit Lektion, Partner und Raum.
 * Dieselbe Menge macht im Client einen Punkt zum Schülerteil
 * (`istSchuelerBereich`, S-89, Zusätzliche Klasse).
 */
export const SCHUELER_BEREICHE: ReadonlySet<string> = new Set([
  'bibellesung',
  'schulung',
  'schulungPartner',
  'schulungVortrag',
])

/** Der eigene Redner des öffentlichen Vortrags (`ROLE_OWN_SPEAKER` im Client). */
const EIGENER_REDNER = 'Redner'

/**
 * Unter welchem Aufgabenbereich ein Platz eines **Programmpunkts** (Hauptsaal,
 * Zusätzliche Klasse, Ratgeber) angeboten wird — `null`: gar nicht.
 *
 * Ohne Bereich nicht, Schulungsaufgaben nicht, und **Rednerplätze** nicht: Der
 * öffentliche Vortrag trägt zwar den Bereich `vortrag`, aber die Rolle
 * „Gastredner" (oder „Redner", „Kreisaufseher") — wer ihn hält, entscheidet der
 * Planer, nicht der schnellste Tipp.
 */
export function programmAngebot(slot: { bereichsKey?: string; rolle?: string } | undefined): string | null {
  const bereich = slot?.bereichsKey
  if (!bereich || SCHUELER_BEREICHE.has(bereich)) return null
  const rolle = slot?.rolle ?? ''
  if (SKIP_ROLE.test(rolle) || rolle.split(' · ')[0] === EIGENER_REDNER) return null
  return bereich
}
