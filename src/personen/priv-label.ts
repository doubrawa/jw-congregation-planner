import type { QualificationKey } from '../data/types'
import type { Dict } from '../i18n/ui'
import { PRIV_KEY } from '../i18n/ui'

/**
 * Beschriftung eines festen Aufgabenbereichs. Einige Bereiche setzen sich aus
 * schon übersetzten Bausteinen zusammen, statt eigene Schlüssel in 34 Sprachen
 * zu verlangen:
 *  - Vorsitz ist nach Zusammenkunft getrennt („Vorsitz · unter der Woche"),
 *  - der Ratgeber gehört zur Zusätzlichen Klasse,
 *  - „nur Gesprächspartner" ist der Schülerteil-Bereich plus die Partner-Rolle,
 *  - die beiden Vorträge tragen ihren Programmteil davor (4.10.2026): „Schätze
 *    aus Gottes Wort · Vorträge" und „Schulungsaufgaben · Vorträge".
 * Wird im Personen-Detail (Schalter) und in der Filterleiste gebraucht.
 */
export function privLabel(t: Dict, key: QualificationKey): string {
  if (key === 'vorsitzMid') return `${t.privVorsitz} · ${t.tabMid}`
  if (key === 'vorsitzWe') return `${t.privVorsitz} · ${t.tabWe}`
  if (key === 'ratgeber') return `${t.auxRatgeber} · ${t.auxKlasse}`
  if (key === 'schulungPartner') return `${t.privSchulung} · ${t.s89Partner}`
  if (key === 'vortrag') return `${t.privSchaetze} · ${t.privVortrag}`
  if (key === 'schulungVortrag') return `${t.privSchulung} · ${t.privVortrag}`
  return t[PRIV_KEY[key]]
}
