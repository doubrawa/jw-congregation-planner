/**
 * Was beim **Löschen eines Hilfsdienstes** zu tun ist.
 *
 * Ein Dienst zieht drei Spuren durch die Daten, und keine davon räumt sich
 * selbst auf, weil alle drei in JSONB liegen (die Datenbank kann hier also
 * keinen Fremdschlüssel anbieten):
 *
 *  1. je Person einen Aufgabenbereich `svc:<key>` (`persons.priv`),
 *  2. je Zusammenkunft eine Platzreihe `helpers[<key>]` (`weeks.data`),
 *  3. je besetztem Platz eine Bestätigung `…|helper|<key>|<pos>`.
 *
 * Bis zum 18. September 2026 blieb alles drei stehen. Sichtbar war das nicht —
 * die Anzeige geht über die Liste der Dienste, und ein gelöschter steht nicht
 * mehr darin. Gemerkt hätte man es erst bei einem Dienst mit **festem**
 * Schlüssel (`ton`, `mik`, …): Wer ihn löscht und später neu anlegt, bekommt
 * lautlos die alten Freigaben und die alten Besetzungen zurück — eine Entscheidung,
 * die niemand getroffen hat.
 *
 * Das Gegenstück, das Löschen einer **Gruppe**, räumt seit jeher auf
 * (`fsGruppeEntfernen`, `persons.grp`); hier fehlte es schlicht.
 *
 * Alle Funktionen sind pur und geben Unverändertes **identisch** zurück — daran
 * erkennt `persist.ts`, was zu schreiben ist (dieselbe Linie wie `fs.ts`,
 * `meeting-edit.ts` und `termine.ts`).
 */

import { MEETING_TABS } from './helpers'
import { helferKey } from './planning'
import type { ConfirmationMap, Person, Week } from './types'

/** Den Aufgabenbereich eines gelöschten Dienstes aus allen Personen nehmen. */
export function dienstBereichEntfernen(persons: Person[], key: string): Person[] {
  // `svc:${string}` — die Form, die `Qualifications` für Hilfsdienst-Bereiche
  // zulässt; `serviceQualKey` bildet genau sie, sagt es dem Typ aber nicht.
  const bereich: `svc:${string}` = `svc:${key}`
  let geaendert = false
  const next = persons.map((p) => {
    if (!(bereich in p.priv)) return p
    const { [bereich]: _weg, ...priv } = p.priv
    geaendert = true
    return { ...p, priv }
  })
  return geaendert ? next : persons
}

/**
 * Die Plätze eines gelöschten Dienstes aus den geladenen Wochen nehmen.
 *
 * **Nur die geladenen** — ältere Wochen außerhalb des Ladefensters behalten
 * ihre Platzreihe. Das ist hinnehmbar: Sie zeigen ohnehin nur, was einmal war,
 * und ein Dienst, den es nicht mehr gibt, wird dort auch nicht mehr angezeigt.
 */
export function dienstAusWochenEntfernen(weeks: Week[], key: string): Week[] {
  let geaendert = false
  const next = weeks.map((week) => {
    let kopie: Week | null = null
    for (const tab of MEETING_TABS) {
      if (!(key in week[tab].helpers)) continue
      const { [key]: _weg, ...helpers } = week[tab].helpers
      kopie = { ...(kopie ?? week), [tab]: { ...week[tab], helpers } }
      geaendert = true
    }
    return kopie ?? week
  })
  return geaendert ? next : weeks
}

/**
 * Die Bestätigungs-Schlüssel der Plätze eines gelöschten Dienstes — über die
 * geladenen Wochen, beide Zusammenkünfte und alle Positionen, die dort besetzt
 * waren.
 *
 * Gesucht wird in den **Wochen**, nicht in den Bestätigungen: Ein Schlüssel
 * entsteht aus Woche, Zusammenkunft, Dienst und Platznummer — wer ihn aus der
 * Bestätigungs-Karte zurücklesen wollte, müsste ihn zerlegen und käme bei einem
 * Dienstnamen mit `|` durcheinander.
 */
export function dienstZusagenKeys(weeks: Week[], key: string): string[] {
  const out: string[] = []
  for (const week of weeks) {
    for (const tab of MEETING_TABS) {
      const arr = week[tab].helpers[key]
      if (!arr) continue
      arr.forEach((_slot, pos) => out.push(helferKey(week.start, tab, key, pos)))
    }
  }
  return out
}

/** Dieselben Schlüssel aus der Bestätigungs-Karte nehmen (für den Zustand). */
export function ohneDienstZusagen(map: ConfirmationMap, keys: string[]): ConfirmationMap {
  if (keys.length === 0 || keys.every((k) => !(k in map))) return map
  const next = { ...map }
  for (const k of keys) delete next[k]
  return next
}
