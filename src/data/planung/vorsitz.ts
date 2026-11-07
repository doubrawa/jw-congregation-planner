/**
 * Der Vorsitz und was ihm folgt: sein Platz in der Eröffnung, die Plätze, die
 * an ihn gekoppelt sind, und der Leiter des Wachtturm-Studiums samt Vertreter.
 */

import { slotsOf } from '../aux-class'
import { dieselbePerson, istArt, isSong } from '../helpers'
import { folgtDemVorsitz } from '../../../supabase/functions/_shared/planung.ts'
import type { Meeting, Person, Section, SlotAssignment, SlotSelection } from '../types'

/** Der Leiter des Wachtturm-Studiums — ihn besetzt Schritt 1 (`wtLeiterZuerst`). */
export function istWtLeiter(section: Section, slot: SlotAssignment): boolean {
  return istArt(section, 'wtStudium') && slot.rolle === 'Leiter'
}

/** Die Leiter-Plätze des Wachtturm-Studiums. Nur das Wochenende hat den Abschnitt. */
export function* wtLeiterPlaetze(meeting: Meeting): Generator<SlotAssignment> {
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) if (istWtLeiter(section, slot)) yield slot
    }
  }
}

/**
 * **Folgt dieser Platz dem Vorsitz — in dieser Zusammenkunft?** Wie
 * `folgtDemVorsitz`, nur liest der Vorsitzende nicht, wenn er das
 * Wachtturm-Studium selbst leitet (T131; von Hand so eingetragen, oder er ist
 * der feste Leiter) — niemand leitet und liest zugleich. Dann ist der Leser ein
 * Platz wie jeder andere: Schritt 2 besetzt ihn, der Bedarf zählt ihn, das
 * Zuteilen-Blatt schlägt vor wie sonst.
 *
 * Die eine Stelle für alle, die die Zusammenkunft kennen — Automatik, Blatt,
 * `bedarf`, Auswertung. Im ersten Entwurf (19.10.2026) stand der Sonderfall
 * nur bei Automatik und Vorschlag; Bedarf und „heute schon dran" kannten ihn
 * nicht.
 */
export function folgtDemVorsitzIn(meeting: Meeting, section: Section, slot: SlotAssignment | undefined): boolean {
  if (!folgtDemVorsitz(section, slot)) return false
  if (!istArt(section, 'wtStudium')) return true
  const vorsitz = vorsitzPlatz(meeting)
  return !vorsitz?.name || ![...wtLeiterPlaetze(meeting)].some((leiter) => dieselbePerson(leiter, vorsitz))
}

/**
 * **Wer das Wachtturm-Studium leitet, wenn es nach den festen Rollen geht**
 * (Personen › Aufgabenbereiche › Feste Rollen): der feste Leiter, sonst sein
 * Vertreter — jeder nur, wenn `frei` ihn lässt. Niemand, wenn es keiner von
 * beiden sein kann; dann wählt die Automatik unter allen, die das Studium
 * leiten dürfen.
 *
 * Die eine Stelle für die Automatik (`rangfolgeLeiter`, damit auch für den
 * Vorschlag im Zuteilen-Blatt) und für die frisch geholte Woche
 * (`festenWtLeiterEintragen`). Stünde die Regel zweimal da, käme beim Holen
 * ein anderer in die Woche, als „Automatisch" nähme.
 */
export function festerWtLeiter(persons: readonly Person[], frei: (p: Person) => boolean): Person | undefined {
  const mit = (rolle: 'wtLeiter' | 'wtVertreter'): Person | undefined => persons.find((p) => p.priv[rolle] && frei(p))
  return mit('wtLeiter') ?? mit('wtVertreter')
}

/** Folgt der ausgewählte Platz dem Vorsitz (`folgtDemVorsitzIn`)? */
export function folgtAuswahlDemVorsitz(meeting: Meeting, sel: SlotSelection | undefined): boolean {
  if (sel?.kind !== 'part') return false
  const section = meeting.sections[sel.si]
  const item = section?.items[sel.ii]
  return Boolean(section && item && !isSong(item) && folgtDemVorsitzIn(meeting, section, slotsOf(item, sel.aux === true)[sel.ni]))
}

/** Der Platz des Vorsitzes in der Eröffnung — `undefined`, wo es keinen gibt. */
export function vorsitzPlatz(meeting: Meeting): SlotAssignment | undefined {
  const opening = meeting.sections.find((s) => istArt(s, 'eroeffnung'))
  return opening?.items.flatMap((i) => (isSong(i) ? [] : i.names)).find((s) => s.rolle === 'Vorsitz')
}
