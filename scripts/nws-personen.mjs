/**
 * Personen-Auflösung für die NWS-Importe — die eine Stelle, an der aus einer
 * NWS-Referenz eine App-Person wird.
 *
 * **Warum eigenständig.** Zwei Importe brauchen dieselbe Zuordnung
 * (Abwesenheiten, Treffpunkte), und sie ist die Stelle, an der ein stiller
 * Fehler am teuersten ist: Trifft sie die falsche Person, steht eine
 * Abwesenheit beim Falschen und eine Leitung bei jemandem, der nichts davon
 * weiß. Zweimal geschrieben hieße: einmal geändert, einmal vergessen.
 *
 * **Die Zuordnung geht über die Id, nicht über den Namen.** Die App-Person
 * trägt `uuid5("person:<NWS-ID>")` — so vergibt sie `build-personen-sql.mjs`.
 * Damit trifft auch eine Namensdublette („Josef Mayer" zweimal) die richtige
 * Person; über den Anzeigenamen wäre sie nicht zu unterscheiden.
 */

import { uuid5 } from './wochenplanung-importieren.mjs'

/** Nicht gelöschte Zeilen einer NWS-Tabelle. */
export const lebend = (arr) => (arr ?? []).filter((x) => !x.Deleted)

/** Reines Datum aus einem NWS-Wert („2026-08-10", „2026-08-10T00:00:00"). */
export function nurDatum(wert) {
  return typeof wert === 'string' ? wert.slice(0, 10) : ''
}

/** Anzeigename einer NWS-Person (`d`, sonst Vor- + Nachname). Getrimmt. */
export function nwsName(p) {
  return (p.d || `${p.a ?? ''} ${p.b ?? ''}`).trim()
}

/**
 * Jede Referenz-Form, unter der NWS auf eine Person zeigt, auf einen Wert
 * abbilden.
 *
 * NWS referenziert je nach Tabelle unterschiedlich: über die volle `ID`
 * (AwayPeriods, FieldServiceMeetings), über die kurze `mid` (Zuteilungen) und
 * über `"<cid>-<mid>"` (UnavailablePeriods). Alle drei zeigen auf dieselbe
 * Person — wer nur eine Form kennt, verliert eine ganze Quelle, und zwar still:
 * Sie sieht dann aus wie „Person fehlt in der App".
 */
function jeReferenz(persons, wert) {
  const m = new Map()
  for (const p of persons ?? []) {
    if (p.ID == null) continue
    const v = wert(p)
    m.set(p.ID, v)
    if (p.mid != null) {
      m.set(p.mid, v)
      if (p.cid) m.set(`${p.cid}-${p.mid}`, v)
    }
  }
  return (ref) => m.get(ref) ?? null
}

/** Personen-Referenz → App-Person-Id (`uuid5("person:<NWS-ID>")`). */
export function personIdAufloeser(persons) {
  return jeReferenz(persons, (p) => uuid5(`person:${p.ID}`))
}

/** Personen-Referenz → NWS-Anzeigename (nur für Meldungen). */
export function nameAufloeser(persons) {
  return jeReferenz(persons, nwsName)
}
