/**
 * **Befristet (T124): die App mit den Rechten einer anderen Stufe ansehen.**
 *
 * Der Betreiber, 16.10.2026: *„einen schalter, der zur laufzeit es möglich
 * macht, dass man in der app umschaltet welche rechte man hat … das würde
 * natürlich später wieder ausgebaut werden. und solange es eingebaut ist,
 * sollte es natürlich nur für admins verfügbar sein"*.
 *
 * Die Ansicht legt sich in `rechteVon` über die echten Rechte — eine Stelle
 * statt der rund zwanzig, die nach Rechten fragen. Sie gilt nur für ein
 * echtes Admin-Konto (`planner`), wird nirgends gespeichert und endet mit dem
 * Neuladen. Die Datenbank kennt weiter nur das echte Recht: Was man in der
 * Ansicht tut, geschieht mit den Rechten des Admins, und was die RLS einem
 * Verkündiger gar nicht schickte, liegt trotzdem im Speicher.
 *
 * **Ausbau:** diese Datei mit ihrer Probe, `ansicht` im Zustand (`context.ts`,
 * `init.ts`), die Aktion `setAnsicht` (`reducer.ts`), die Karte im Profil
 * (`AnsichtKarte`), die Leiste (`AnsichtLeiste`), je eine Zeile in
 * `rechteVon` und `rechteStufe` — und die Texte `ansicht…`.
 */
import type { Rechte } from './rechte'
import type { Group, Person } from './types'

/** Als was der Admin die App ansehen kann — er selbst ist „keine Ansicht". */
export const ANSICHT_STUFEN = ['planer', 'gruppenaufseher', 'verkuendiger'] as const
export type AnsichtStufe = (typeof ANSICHT_STUFEN)[number]

export interface Ansicht {
  stufe: AnsichtStufe
  /** Die Gruppe, deren Aufseher man spielt — bei den anderen Stufen `null`. */
  gruppe: string | null
}

/**
 * Die Rechte einer Stufe — so, wie `rechteVon` sie einem echten Konto dieser
 * Stufe gäbe: Der Planer plant alles, der Gruppenaufseher die Treffpunkte
 * seiner Gruppe, der Verkündiger nichts. Admin ist keiner von ihnen.
 */
export function rechteDerAnsicht(a: Ansicht): Rechte {
  return {
    admin: false,
    zuteilen: a.stufe === 'planer',
    gruppe: a.stufe === 'gruppenaufseher' ? a.gruppe : null,
  }
}

/**
 * Die Gruppe, als deren Aufseher der Admin die App ansieht: die seiner eigenen
 * Person, sonst die erste. `null`, wenn die Versammlung keine hat — dann gibt
 * es die Stufe nicht.
 */
export function ansichtsGruppe(
  groups: readonly Group[],
  persons: readonly Person[],
  personId: string | null,
): string | null {
  const eigene = persons.find((p) => p.id === personId)?.grp
  if (eigene && groups.some((g) => g.id === eigene)) return eigene
  return groups[0]?.id ?? null
}
