import { serviceQualKey } from '../data/helpers'
import type { QualificationKey, Service } from '../data/types'
import type { Dict } from '../i18n/ui'
import { PRIV_KEY } from '../i18n/ui'

/**
 * Beschriftung eines festen Aufgabenbereichs. Einige Bereiche setzen sich aus
 * schon übersetzten Bausteinen zusammen, statt eigene Schlüssel in jeder Sprache
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

/**
 * **Der Name eines Aufgabenbereichs, wie er an einem Platz steht** — ein
 * Hilfsdienst mit dem Namen, den die Versammlung ihm gab (`tu`, denn er ist
 * Datum, kein UI-Text), sonst die feste Beschriftung. Ein Dienst, den es nicht
 * mehr gibt, behält seinen Schlüssel als Namen, statt leer zu bleiben.
 * Für den Stand der Woche und die Auswertung (T126).
 */
export function bereichsName(key: string, services: readonly Service[], t: Dict, tu: (s: string) => string): string {
  const svc = services.find((s) => serviceQualKey(s.key) === key)
  if (svc) return tu(svc.name)
  if (key.startsWith('svc:')) return key.slice('svc:'.length)
  return privLabel(t, key as QualificationKey) ?? key
}
