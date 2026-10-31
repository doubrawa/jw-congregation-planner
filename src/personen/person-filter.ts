import { enthaelt } from '../components/suche'
import { displayName, privWert } from '../data/helpers'
import type { Person, Role } from '../data/types'
import type { AnmeldeStand, PersonLage } from './person-lage'

/**
 * **Die Auswahl über der Liste** (T121, Entwurf `GPersonen`) — eine zur Zeit:
 * ein Stand der Anmeldung (oben gezählt), „Nicht angemeldet" (mit Link oder
 * ohne) oder wer heute abwesend ist. Leer heißt: alle.
 */
export type Auswahl = '' | AnmeldeStand | 'nichtAngemeldet' | 'abwesend'

/**
 * Zustand der Suchleiste über der Personenliste. Leerer String = kein Filter,
 * die Felder sind also frei kombinierbar (UND-Verknüpfung).
 */
export interface PersonFilter {
  q: string // Volltext über den Namen
  auswahl: Auswahl
  sex: '' | 'm' | 'w'
  role: '' | Role
  grp: string // Group.id
  priv: string // Aufgabenbereich-Key (fest, feste Rolle wie `wtLeiter` oder `svc:<dienst>`)
}

/**
 * Die Felder, die das Blatt „Filter" setzt — Geschlecht, Rolle, Gruppe und
 * Aufgabenbereich —, alle leer. „Zurücksetzen" setzt genau diese.
 */
export const OHNE_BLATTFILTER = { sex: '', role: '', grp: '', priv: '' } as const satisfies Partial<PersonFilter>

export const KEIN_FILTER: PersonFilter = { q: '', auswahl: '', ...OHNE_BLATTFILTER }

/** Wie viele Felder des Blatts gesetzt sind — die Zahl am Knopf „Filter". */
export function gesetzteBlattfilter(f: PersonFilter): number {
  return (Object.keys(OHNE_BLATTFILTER) as Array<keyof typeof OHNE_BLATTFILTER>).filter((feld) => f[feld] !== '').length
}

/**
 * Volltext über Name und E-Mail. Bis zum 25.10.2026 auch über die
 * Telefonnummer, ziffernweise — das Feld ist entfallen.
 *
 * **Der Name auch so, wie die Liste ihn zeigt.** Dort steht „Krüger, Simon";
 * gesucht wurde bis zum 1.10.2026 aber nur in „Simon Krüger". Wer abtippte, was
 * er sah, oder „krüger s" eingab, um unter Namensvettern zu wählen, fand
 * niemanden. Und ohne Faltung fand „kruger" keinen „Krüger" — „kru" traf nur,
 * wenn zufällig die E-Mail-Adresse `…krueger@…` lautete (die gibt es seit dem
 * 31.10.2026 nicht mehr).
 */
function passtZuText(person: Person, q: string): boolean {
  const namen = [displayName(person), `${person.ln} ${person.fn}`, `${person.ln}, ${person.fn}`]
  return enthaelt(namen.join('\n').toLowerCase(), q)
}

/** Fällt die Person unter die Auswahl über der Liste? */
export function passtZurAuswahl(auswahl: Auswahl, lage: PersonLage): boolean {
  switch (auswahl) {
    case '':
      return true
    case 'nichtAngemeldet':
      return lage.stand !== 'angemeldet'
    case 'abwesend':
      return lage.abwesenheit !== undefined
    default:
      return lage.stand === auswahl
  }
}

/**
 * Erfüllt die Person Suche und Felder — alles außer der Auswahl? Die Liste
 * fragt beides getrennt: So zählen die Knöpfe der Auswahl, wie viele es **unter
 * den übrigen Filtern** wären.
 */
export function passtOhneAuswahl(person: Person, f: PersonFilter): boolean {
  const q = f.q.trim().toLowerCase()
  if (q && !passtZuText(person, q)) return false
  if (f.sex && (f.sex === 'w') !== Boolean(person.female)) return false
  if (f.role && person.role !== f.role) return false
  if (f.grp && (person.grp ?? '') !== f.grp) return false
  if (f.priv && !privWert(person.priv, f.priv)) return false
  return true
}
