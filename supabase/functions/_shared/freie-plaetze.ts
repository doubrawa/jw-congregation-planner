// =============================================================================
// Geteilt: welche Hilfsdienst-Plätze man selbst übernehmen kann
// =============================================================================
// Eine Regel, mehrere Fragesteller: Der Client bietet an — freie Plätze
// (`src/data/offene-plaetze.ts`) und Gesuche zum Einspringen
// (`deriveSubstituteReqs`) —, die Edge Function `substitute` trägt ein ('fill',
// 'take') und schickt ein Gesuch ('seek'). Liefen sie auseinander, böte die
// App einen Platz an, den der Server abweist — oder der Server nähme einen,
// den die App nie angeboten hätte.
//
// **Nur Hilfsdienste** (Betreiber: „freie plätze dürfen nur hilfsdienste
// betreffen. aufgaben weist der planer zu"). Dass ein Platz ein Hilfsdienst
// ist, steht im Schlüssel (`art: 'helper'`); jede Seite prüft das zuerst.
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

/** Warum jemand einen Hilfsdienst-Platz nicht selbst übernehmen darf — so, wie `substitute` es meldet. */
export type Uebernahmehindernis = 'not-offered' | 'not-qualified' | 'past' | 'absent'

/**
 * Der HTTP-Status zu jedem Hindernis: kein Recht (403) — oder ein Recht, das an
 * diesem Termin nicht greift (409).
 */
export const HINDERNIS_STATUS: Readonly<Record<Uebernahmehindernis, 403 | 409>> = {
  'not-offered': 403,
  'not-qualified': 403,
  past: 409,
  absent: 409,
}

/**
 * **Darf diese Person den Platz selbst übernehmen?** — einen freien (`fill`)
 * wie den eines anderen, der abgesagt hat (`take`). Eine Regel für die App,
 * die anbietet (`offenePlaetze`, `deriveSubstituteReqs`), und für
 * `substitute`, das einträgt und wen ein Gesuch erreicht (`seek`). `null`: ja.
 *
 *  - Der Dienst wird angeboten (keine Gruppe), und die Person hat seinen
 *    Bereich.
 *  - Sie steht auf keinem Platz dieses Dienstes, auch nicht auf diesem: Ein
 *    zweiter Platz brächte dem Dienst niemanden dazu, und den eigenen
 *    übernimmt man nicht (`stehtImDienst`).
 *  - Die Zusammenkunft ist nicht vorbei, und die Person ist an dem Tag da.
 *
 * Ob die Zusammenkunft ausfällt, ob der Plan gesendet ist und ob es ein Gesuch
 * gibt, fragt jeder Weg vorher selbst — das hängt an der Zusammenkunft, nicht
 * an der Person.
 */
export function uebernahmeHindernis(lage: {
  svc: { key: string; groups?: boolean }
  /** Hat die Person diesen Aufgabenbereich? */
  hatBereich: (bereich: string) => boolean
  imDienst: boolean
  vorbei: boolean
  abwesend: boolean
}): Uebernahmehindernis | null {
  const bereich = angebotsBereich(lage.svc)
  if (!bereich) return 'not-offered'
  if (!lage.hatBereich(bereich)) return 'not-qualified'
  if (lage.imDienst) return 'not-offered'
  if (lage.vorbei) return 'past'
  if (lage.abwesend) return 'absent'
  return null
}

/**
 * Steht die Person auf einem Platz dieser Reihe? **Id vor Name**: Trägt der
 * Platz eine Id, entscheidet sie; der Name nur dort, wo es keine gibt
 * (Altbestand) — wie `gehoertZu` in der App.
 */
export function stehtImDienst(
  reihe: ReadonlyArray<{ name?: string; pid?: string } | null | undefined>,
  person: { id: string; name: string },
): boolean {
  return reihe.some((s) => Boolean(s?.name) && (s?.pid ? s.pid === person.id : s?.name === person.name))
}
