/**
 * Zuteilungslogik — Kernregeln aus dem Design-Handoff ("Interaktionen &
 * Verhalten"): nur Qualifizierte, Abwesende blockiert, Auslastung über alle
 * geladenen Wochen, Auto-Zuteilung wählt geringste Auslastung, Reinigung
 * rotiert Gruppen (Wochenindex mod 3), Gastredner-Slots werden übersprungen.
 *
 * Alle Funktionen sind pur (Eingaben bleiben unverändert) — geeignet für
 * den Reducer und später direkt testbar.
 */

import { displayName, isQualified, isSong, workloadOf } from './helpers'
import type { Meeting, MeetingTab, Person, Service, SlotSelection, Week } from './types'

/** Aktueller Name auf einem Slot ("" = offen). */
export function slotValue(weeks: Week[], sel: SlotSelection): string {
  const meeting = weeks[sel.wi][sel.tab]
  if (sel.kind === 'part') {
    const item = meeting.sections[sel.si].items[sel.ii]
    return isSong(item) ? '' : (item.names[sel.ni]?.name ?? '')
  }
  return meeting.helpers[sel.svc]?.[sel.pos] ?? ''
}

/** Setzt einen Slot auf `name` ("" = Zuteilung entfernen). */
export function assignSlot(weeks: Week[], sel: SlotSelection, name: string): Week[] {
  const next = structuredClone(weeks)
  const meeting = next[sel.wi][sel.tab]
  if (sel.kind === 'part') {
    const item = meeting.sections[sel.si].items[sel.ii]
    if (!isSong(item)) item.names[sel.ni].name = name
  } else {
    const arr = meeting.helpers[sel.svc] ?? []
    while (arr.length <= sel.pos) arr.push('')
    arr[sel.pos] = name
    meeting.helpers[sel.svc] = arr
  }
  return next
}

/** Offene Zuteilungen in einer Ansicht (Programmpunkte + Hilfsdienst-Plätze). */
export function countOpenSlots(meeting: Meeting, services: Service[]): number {
  let count = 0
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) if (!slot.name) count++
    }
  }
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) if (!arr[pos]) count++
  }
  return count
}

export interface AutoAssignResult {
  weeks: Week[]
  count: number // Anzahl vergebener Zuteilungen
}

/**
 * Auto-Zuteilung für eine Woche+Meeting: füllt alle offenen Slots.
 * Kandidaten = qualifiziert + anwesend + noch nicht in diesem Meeting
 * eingeteilt; gewählt wird die geringste Auslastung (über alle Wochen,
 * Stand vor der Auto-Zuteilung — wie im Prototyp).
 */
export function autoAssignMeeting(
  weeks: Week[],
  weekIndex: number,
  tab: MeetingTab,
  persons: Person[],
  services: Service[],
): AutoAssignResult {
  const next = structuredClone(weeks)
  const meeting = next[weekIndex][tab]

  const used = new Set<string>()
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) if (slot.name) used.add(slot.name)
    }
  }
  for (const arr of Object.values(meeting.helpers)) {
    for (const name of arr) if (name) used.add(name)
  }

  const pickFor = (priv: string | null | undefined): string | null => {
    const candidates = persons
      .filter((p) => (!priv || isQualified(p, priv)) && !p.absent.includes(weekIndex))
      .map((p) => displayName(p))
      .filter((name) => !used.has(name))
    if (candidates.length === 0) return null
    candidates.sort((a, b) => workloadOf(weeks, a) - workloadOf(weeks, b))
    return candidates[0]
  }

  let count = 0

  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (slot.name || (slot.rolle ?? '').includes('Gastredner')) continue
        const name = pickFor(slot.bereichsKey)
        if (name) {
          slot.name = name
          used.add(name)
          count++
        }
      }
    }
  }

  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if (arr[pos]) continue
      while (arr.length <= pos) arr.push('')
      if (svc.groups) {
        arr[pos] = `Gruppe ${1 + (weekIndex % 3)}`
        count++
      } else {
        const name = pickFor(svc.priv)
        if (name) {
          arr[pos] = name
          used.add(name)
          count++
        }
      }
    }
    meeting.helpers[svc.key] = arr
  }

  return { weeks: next, count }
}
