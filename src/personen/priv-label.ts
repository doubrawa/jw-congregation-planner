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
  return privLabelTeile(t, key).join(' · ')
}

/**
 * **Die Bausteine dieser Beschriftung** — für die senkrechten Köpfe der
 * Tabelle Person × Bereich, die je Baustein eine Zeile setzt. `kurz` nennt die
 * Zusammenkunft kurz („unter der Woche" statt „Zusammenkunft unter der
 * Woche"). Bis zum 17.10.2026 zerlegte die Tabelle den fertigen Namen wieder an
 * „ · " und tauschte die Zusammenkunft per Textvergleich.
 */
export function privLabelTeile(t: Dict, key: QualificationKey, kurz = false): string[] {
  if (key === 'vorsitzMid') return [t.privVorsitz, kurz ? t.unterDerWoche : t.tabMid]
  if (key === 'vorsitzWe') return [t.privVorsitz, kurz ? t.amWochenende : t.tabWe]
  if (key === 'ratgeber') return [t.auxRatgeber, t.auxKlasse]
  if (key === 'schulungPartner') return [t.privSchulung, t.s89Partner]
  if (key === 'vortrag') return [t.privSchaetze, t.privVortrag]
  if (key === 'schulungVortrag') return [t.privSchulung, t.privVortrag]
  return [t[PRIV_KEY[key]]]
}

/**
 * **Der Name eines Aufgabenbereichs, wie er an einem Platz steht** — ein
 * Hilfsdienst mit dem Namen, den die Versammlung ihm gab (`tu`, denn er ist
 * Datum, kein UI-Text), sonst die feste Beschriftung. Ein Dienst, den es nicht
 * mehr gibt, behält seinen Schlüssel als Namen, statt leer zu bleiben.
 * Für den Stand der Woche und die Auswertung (T126).
 */
export function bereichsName(key: string, services: readonly Service[], t: Dict, tu: (s: string) => string): string {
  return bereichsTeile(key, services, t, tu).join(' · ')
}

/**
 * Derselbe Name in seinen Bausteinen (`privLabelTeile`) — ein Hilfsdienst ist
 * einer, auch wenn sein Name selbst „ · " enthält. Ein Bereich, den die App
 * nicht kennt (Altbestand), heißt nach seinem Schlüssel.
 */
export function bereichsTeile(key: string, services: readonly Service[], t: Dict, tu: (s: string) => string, kurz = false): string[] {
  const svc = services.find((s) => serviceQualKey(s.key) === key)
  if (svc) return [tu(svc.name)]
  if (key.startsWith('svc:')) return [key.slice('svc:'.length)]
  const teile = privLabelTeile(t, key as QualificationKey, kurz)
  return teile.every(Boolean) ? teile : [key]
}
