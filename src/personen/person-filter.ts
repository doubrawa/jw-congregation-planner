import { fullName } from '../data/helpers'
import type { Person, Role } from '../data/types'

/**
 * Zustand der Suchleiste über der Personenliste. Leerer String = kein Filter,
 * die Felder sind also frei kombinierbar (UND-Verknüpfung).
 */
export interface PersonFilter {
  q: string // Volltext über Name, Telefon, E-Mail
  sex: '' | 'm' | 'w'
  role: '' | Role
  grp: string // Group.id
  priv: string // Aufgabenbereich-Key (fest oder `svc:<dienst>`)
}

export const KEIN_FILTER: PersonFilter = { q: '', sex: '', role: '', grp: '', priv: '' }

/** Eingabe, die nur aus Telefon-Zeichen besteht (Ziffern und deren Trenner). */
const NUR_TELEFON = /^[\d\s+()./-]+$/

const ziffern = (s: string) => s.replace(/\D+/g, '')

/**
 * Volltext über Name, Anzeigename, Telefon und E-Mail. Sieht die Eingabe nach
 * einer Telefonnummer aus, wird zusätzlich ziffernweise verglichen — sonst
 * fände „01701234" die gespeicherte „0170 1234" nicht (und umgekehrt).
 */
function passtZuText(person: Person, q: string): boolean {
  const heu = [fullName(person), person.dn ?? '', person.tel, person.mail].join('\n').toLowerCase()
  if (heu.includes(q)) return true
  if (!NUR_TELEFON.test(q)) return false
  const nur = ziffern(q)
  return nur.length > 0 && ziffern(person.tel).includes(nur)
}

/** Erfüllt die Person alle gesetzten Filter? */
export function passtZumFilter(person: Person, f: PersonFilter): boolean {
  const q = f.q.trim().toLowerCase()
  if (q && !passtZuText(person, q)) return false
  if (f.sex && (f.sex === 'w') !== Boolean(person.female)) return false
  if (f.role && person.role !== f.role) return false
  if (f.grp && (person.grp ?? '') !== f.grp) return false
  if (f.priv && !person.priv[f.priv]) return false
  return true
}
