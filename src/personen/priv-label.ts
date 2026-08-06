import type { QualificationKey } from '../data/types'
import type { Dict } from '../i18n/ui'
import { PRIV_KEY } from '../i18n/ui'

/**
 * Beschriftung eines festen Aufgabenbereichs. Zwei Bereiche setzen sich aus
 * schon übersetzten Bausteinen zusammen, statt eigene Schlüssel in 34 Sprachen
 * zu verlangen:
 *  - Vorsitz ist nach Zusammenkunft getrennt („Vorsitz · unter der Woche"),
 *  - der Ratgeber gehört zur Zusätzlichen Klasse,
 *  - „nur Gesprächspartner" ist der Schülerteil-Bereich plus die Partner-Rolle.
 * Wird im Personen-Detail (Schalter) und in der Filterleiste gebraucht.
 */
export function privLabel(t: Dict, key: QualificationKey): string {
  if (key === 'vorsitzMid') return `${t.privVorsitz} · ${t.tabMid}`
  if (key === 'vorsitzWe') return `${t.privVorsitz} · ${t.tabWe}`
  if (key === 'ratgeber') return `${t.auxRatgeber} · ${t.auxKlasse}`
  if (key === 'schulungPartner') return `${t.privSchulung} · ${t.s89Partner}`
  return t[PRIV_KEY[key]]
}
