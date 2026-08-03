/**
 * Zusätzliche Klasse (jw.org, „Anweisungen für die Leben-und-Dienst-
 * Zusammenkunft", Absatz 26).
 *
 * Hat eine Versammlung viele Verkündiger, kann sie die Schulungsaufgaben
 * parallel in einem zweiten Raum durchführen, damit jeder öfter drankommt.
 * Die Teilnehmer gehen im Anschluss an „Nach geistigen Schätzen graben"
 * hinüber und kehren nach der letzten Schulungsaufgabe in den Hauptsaal
 * zurück. Betroffen sind damit genau die Schülerteile: die Bibellesung und
 * alles unter „Uns im Dienst verbessern".
 *
 * Für jede Zusätzliche Klasse muss ein befähigter Ratgeber da sein
 * (Aufgabenbereich `ratgeber`) — einer je Zusammenkunft, nicht je Punkt.
 */

import type { Meeting, PartItem, ProgramItem, SlotAssignment, Week } from './types'
import { isSong } from './helpers'

/**
 * Bereiche, die einen Programmpunkt zum Schülerteil machen. Bewusst über die
 * Slot-Bereiche und nicht über den Titel: Titel kommen in der Sprache der
 * Versammlung aus dem Arbeitsheft, die Bereiche sind kanonisch.
 */
const SCHUELER_BEREICHE = new Set(['bibellesung', 'schulung', 'schulungPartner'])

/** Wird dieser Punkt in der Zusätzlichen Klasse wiederholt? */
export function istSchuelerteil(item: ProgramItem): boolean {
  if (isSong(item)) return false
  return item.names.some((s) => s.bereichsKey != null && SCHUELER_BEREICHE.has(s.bereichsKey))
}

/** Plätze eines Punkts — Hauptsaal oder Zusätzliche Klasse. */
export function slotsOf(item: PartItem, aux: boolean): SlotAssignment[] {
  return aux ? (item.aux ?? []) : item.names
}

/** Leerer Platz mit denselben Regeln wie sein Gegenstück im Hauptsaal. */
function leererPlatz(vorlage: SlotAssignment): SlotAssignment {
  const platz: SlotAssignment = { name: '' }
  if (vorlage.rolle !== undefined) platz.rolle = vorlage.rolle
  if (vorlage.bereichsKey !== undefined) platz.bereichsKey = vorlage.bereichsKey
  if (vorlage.male !== undefined) platz.male = vorlage.male
  return platz
}

/**
 * Plätze der Zusätzlichen Klasse an die des Hauptsaals angleichen.
 *
 * Nötig, weil sich die Zahl der Plätze eines Schülerteils ändern kann (ein
 * Gesprächspartner kommt dazu oder fällt weg). Bereits vergebene Namen bleiben
 * dabei stehen — es wird nur ergänzt und gekürzt, nie geleert.
 */
export function angleichen(item: PartItem): SlotAssignment[] {
  const vorhanden = item.aux ?? []
  return item.names.map((vorlage, i) => {
    const alt = vorhanden[i]
    if (!alt) return leererPlatz(vorlage)
    // Regeln folgen immer dem Hauptsaal; nur die Besetzung bleibt.
    const platz = leererPlatz(vorlage)
    platz.name = alt.name
    if (alt.pid !== undefined) platz.pid = alt.pid
    return platz
  })
}

/**
 * Wochen so herrichten, dass die Zusätzliche Klasse benutzbar ist: jeder
 * Schülerteil der Zusammenkunft unter der Woche bekommt seine zweite
 * Platzreihe.
 *
 * Beim Ausschalten wird NICHTS gelöscht. Wer die Klasse versehentlich
 * abschaltet, verliert sonst die Planung mehrerer Wochen; die Anzeige blendet
 * sie ohnehin aus, und beim Wiedereinschalten ist alles wieder da.
 */
export function syncAuxSlots(weeks: Week[], an: boolean): Week[] {
  if (!an) return weeks
  let geaendert = false
  const naechste = weeks.map((week) => {
    const mid = week.mid
    let midGeaendert = false
    const sections = mid.sections.map((section) => {
      let sectionGeaendert = false
      const items = section.items.map((item) => {
        if (!istSchuelerteil(item)) return item
        const part = item as PartItem
        const neu = angleichen(part)
        if (gleich(part.aux, neu)) return item
        sectionGeaendert = true
        return { ...part, aux: neu }
      })
      if (!sectionGeaendert) return section
      midGeaendert = true
      return { ...section, items }
    })
    // Der Ratgeber-Platz muss ebenfalls in den Daten stehen, nicht nur beim
    // Anzeigen entstehen: sonst zählt ihn niemand als offen, die automatische
    // Zuteilung übergeht ihn und es geht keine Erinnerung hinaus.
    const brauchtRatgeber = !mid.auxRatgeber
    if (!midGeaendert && !brauchtRatgeber) return week
    geaendert = true
    const neuesMid = { ...mid, sections }
    if (brauchtRatgeber) neuesMid.auxRatgeber = ratgeberSlot(mid)
    return { ...week, mid: neuesMid }
  })
  return geaendert ? naechste : weeks
}

/** Zwei Platzreihen inhaltlich gleich? (Vermeidet unnötige Neuschreibungen.) */
function gleich(a: SlotAssignment[] | undefined, b: SlotAssignment[]): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((s, i) => JSON.stringify(s) === JSON.stringify(b[i]))
}

/** Alle Schülerteile einer Zusammenkunft mit ihren Positionen. */
export function schuelerteile(meeting: Meeting): Array<{ si: number; ii: number; item: PartItem }> {
  const out: Array<{ si: number; ii: number; item: PartItem }> = []
  meeting.sections.forEach((section, si) =>
    section.items.forEach((item, ii) => {
      if (istSchuelerteil(item)) out.push({ si, ii, item: item as PartItem })
    }),
  )
  return out
}

/**
 * Rollenbezeichnung des Ratgebers — kanonisch deutsch wie alle Rollen in den
 * Wochendaten (Vorsitz, Gebet, Leser …); übersetzt wird erst bei der Anzeige.
 */
export const RATGEBER_ROLLE = 'Ratgeber'

/** Ratgeber-Platz einer Zusammenkunft (immer vorhanden, ggf. offen). */
export function ratgeberSlot(meeting: Meeting): SlotAssignment {
  return (
    meeting.auxRatgeber ?? { name: '', rolle: RATGEBER_ROLLE, bereichsKey: 'ratgeber', male: true }
  )
}
