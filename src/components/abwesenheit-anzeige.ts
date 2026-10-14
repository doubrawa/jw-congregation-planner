import type { Absence } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import { tageSpanne } from './datum-anzeige'

/**
 * „abwesend 7.–11. September" — derselbe Satz beim Zuteilen (Karte oben und
 * Zeile darunter) und in der Personenliste. Mit Zeitraum statt nur
 * „abwesend": Wer nur noch zwei Tage weg ist, wird anders gefragt als jemand,
 * der den ganzen Monat fehlt.
 */
export function abwesendText(a: Pick<Absence, 'from' | 'to'>, t: Pick<Dict, 'abwesendZeitraum'>, lang: string): string {
  return fill(t.abwesendZeitraum, { zeitraum: tageSpanne(a.from, a.to, lang, 'tagMonat') })
}
