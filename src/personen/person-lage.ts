import { abwesenheitAm } from '../data/absence'
import { fromIso } from '../data/meeting-dates'
import { rechteDerPerson } from '../data/rechte'
import type { Absence, Invite, Member, Person } from '../data/types'

/**
 * **Wie weit eine Person mit der App ist** (T121, Entwurf `GPersonen`):
 * angemeldet, eingeladen oder noch nicht eingeladen.
 *
 * Angemeldet heißt: Ein Konto ist mit ihr verknüpft. Ein offener
 * Einladungscode macht noch niemanden erreichbar — dieselbe Grenze zieht
 * `send-plan` für seine Liste derer, die es persönlich erfahren müssen.
 */
export type AnmeldeStand = 'angemeldet' | 'eingeladen' | 'ohne'

/** Was die Personenliste über eine Person sagt, außer ihren Stammdaten. */
export interface PersonLage {
  stand: AnmeldeStand
  /** Die Abwesenheit, in der die Person heute steht — sonst `undefined`. */
  abwesenheit: Absence | undefined
  /** Die Rechte bei ihr — die Marke „Admin" oder „Planer" in der Zeile. */
  rechte: { admin: boolean; planer: boolean }
}

export interface PersonMitLage {
  person: Person
  lage: PersonLage
}

/**
 * Die Personen mit ihrer Lage, in der gegebenen Folge — einmal für die ganze
 * Liste gerechnet: die Konten je Person vorab gesammelt statt einer Suche je
 * Person (bei 300 Personen und 300 Konten sonst 90 000 Vergleiche je
 * Tastendruck in der Suche). `heute` ist ein ISO-Datum.
 */
export function mitLage(
  persons: readonly Person[],
  quelle: { members: readonly Member[]; invites: readonly Invite[]; absences: readonly Absence[] },
  heute: string,
): PersonMitLage[] {
  const kontenVon = new Map<string, Member[]>()
  for (const m of quelle.members) {
    if (m.personId) kontenVon.set(m.personId, [...(kontenVon.get(m.personId) ?? []), m])
  }
  const eingeladen = new Set(quelle.invites.map((i) => i.personId))
  const tag = fromIso(heute)
  return persons.map((person) => {
    const konten = kontenVon.get(person.id) ?? []
    return {
      person,
      lage: {
        stand: konten.length > 0 ? 'angemeldet' : eingeladen.has(person.id) ? 'eingeladen' : 'ohne',
        abwesenheit: abwesenheitAm(quelle.absences, person.id, tag),
        rechte: rechteDerPerson(konten, person),
      },
    }
  })
}
