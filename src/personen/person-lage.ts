import { abwesenheitAm } from '../data/absence'
import { fromIso } from '../data/meeting-dates'
import { rechteDerPerson } from '../data/rechte'
import type { Absence, AnmeldeLink, Member, Person } from '../data/types'

/**
 * **Wie weit eine Person mit der App ist** (T121, Phase 8; Entwurf
 * `GPersonen`): angemeldet, mit Link oder ohne.
 *
 * Angemeldet heißt: Ein Konto ist mit ihr verknüpft. Ein Link macht noch
 * niemanden erreichbar — dieselbe Grenze zieht `send-plan` für seine Liste
 * derer, die es persönlich erfahren müssen. Ein abgelaufener zählt wie keiner:
 * Wer so steht, braucht einen neuen.
 */
export type AnmeldeStand = 'angemeldet' | 'link' | 'ohne'

/**
 * Gilt der Link heute noch? Tagesgenau (`heute` ist ein ISO-Datum): Am Tag,
 * an dem er abläuft, gilt er hier noch bis zum Abend — der Server prüft auf
 * die Sekunde.
 */
export function linkGilt(link: Pick<AnmeldeLink, 'gueltigBis'>, heute: string): boolean {
  return link.gueltigBis > heute
}

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
  quelle: { members: readonly Member[]; anmeldeLinks: readonly AnmeldeLink[]; absences: readonly Absence[] },
  heute: string,
): PersonMitLage[] {
  const kontenVon = new Map<string, Member[]>()
  for (const m of quelle.members) {
    if (m.personId) kontenVon.set(m.personId, [...(kontenVon.get(m.personId) ?? []), m])
  }
  const mitLink = new Set(quelle.anmeldeLinks.filter((l) => linkGilt(l, heute)).map((l) => l.personId))
  const tag = fromIso(heute)
  return persons.map((person) => {
    const konten = kontenVon.get(person.id) ?? []
    return {
      person,
      lage: {
        stand: konten.length > 0 ? 'angemeldet' : mitLink.has(person.id) ? 'link' : 'ohne',
        abwesenheit: abwesenheitAm(quelle.absences, person.id, tag),
        rechte: rechteDerPerson(konten, person),
      },
    }
  })
}
