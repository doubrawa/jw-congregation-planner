/**
 * Offene Plätze einer Zusammenkunft: wie viele es sind und wie sie im
 * Planen-Banner heißen.
 */

import { allePlaetze, leerVorOrt } from '../plaetze'
import { RATGEBER_ROLLE } from '../aux-class'
import { istBlockSektion, rolleMitHerkunft } from '../helpers'
import type { Meeting, Service } from '../types'

/**
 * Offene Zuteilungen in einer Ansicht (Programmpunkte + Hilfsdienst-Plätze).
 * Die Plätze der Zusätzlichen Klasse zählen mit — sie sind ebenso zu besetzen;
 * ohne sie meldete der Planen-Kopf „alles zugeteilt", während die halbe Klasse
 * noch offen wäre. Ist keine eingerichtet, gibt es sie schlicht nicht.
 */
export function countOpenSlots(meeting: Meeting, services: Service[]): number {
  let count = 0
  for (const platz of allePlaetze(meeting, services)) if (!platz.slot?.name && !leerVorOrt(meeting, platz)) count++
  return count
}

/** Offener Slot fürs Planen-Banner (lang wie MeetingAssignment: 'u'|'p'). */
export interface OpenSlot {
  text: string
  lang: 'u' | 'p'
  /**
   * Rolle hinter dem Titel („Versammlungsbibelstudium · Leiter"), **immer**
   * App-Sprache. Sie steht als eigenes Feld und nicht im Text, weil beide
   * Hälften aus verschiedenen Wörterbüchern kommen: der Titel aus der Sprache
   * der Versammlung (`tpw`), die Rolle aus der des Lesers (`tu`). In einem
   * String zusammengefügt bekäme eine der beiden die falsche.
   */
  rolle?: string
  n: number // Anzahl offener Plätze (Hilfsdienste können mehrere haben)
}

/**
 * Offene Slots einer Zusammenkunft mit Beschriftung — gleiche Konvention wie
 * assignmentsInMeeting: Rolle bevorzugt (App-Sprache), sonst Titel
 * (Programmsprache); Hilfsdienste je Dienst gebündelt mit Anzahl.
 */
export function openSlotLabels(meeting: Meeting, services: Service[]): OpenSlot[] {
  const out: OpenSlot[] = []
  // Derselbe Durchlauf, den `countOpenSlots` zählt — sonst stünde im
  // Planen-Kopf eine höhere Zahl, als das Banner darunter auflistet. Ebenso
  // ohne das leere Schlussgebet am Wochenende (`leerVorOrt`).
  // Hilfsdienste werden gebündelt: ein Eintrag je Dienst mit seiner Anzahl.
  const offenJeDienst = new Map<Service, number>()
  for (const platz of allePlaetze(meeting, services)) {
    if (platz.slot?.name || leerVorOrt(meeting, platz)) continue
    if (platz.art === 'helper') {
      offenJeDienst.set(platz.svc, (offenJeDienst.get(platz.svc) ?? 0) + 1)
      continue
    }
    if (platz.art === 'ratgeber') {
      out.push({ text: RATGEBER_ROLLE, lang: 'u', n: 1 })
      continue
    }
    // Dieselbe Regel wie in der Aufgabenliste (`zuteilungsLabel`), nur in zwei
    // Atomen statt einem — Titel und Rolle kommen aus verschiedenen Sprachen
    // (siehe OpenSlot.rolle).
    const rolle = rolleMitHerkunft(platz.slot) ?? ''
    out.push(
      rolle && istBlockSektion(platz.section)
        ? { text: rolle, lang: 'u', n: 1 }
        : { text: platz.item.title, lang: 'p', rolle: rolle || undefined, n: 1 },
    )
  }
  for (const [svc, n] of offenJeDienst) out.push({ text: svc.name, lang: 'u', n })
  return out
}
