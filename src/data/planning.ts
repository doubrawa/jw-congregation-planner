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
import type {
  ConfirmationMap,
  Meeting,
  MeetingTab,
  MyTask,
  PartItem,
  Person,
  S89Payload,
  Service,
  SlotSelection,
  Week,
} from './types'

/** Rollen, die die Auto-Zuteilung nicht besetzt (kommen von außen). */
const SKIP_ROLE = /Gastredner|Kreisaufseher/

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
  newly: string[] // neu vergebene Personennamen (→ pendingNames)
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
  const newly: string[] = []

  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        // Gastredner-/Kreisaufseher-Slots kommen von außen und bleiben offen
        if (slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue
        const name = pickFor(slot.bereichsKey)
        if (name) {
          slot.name = name
          used.add(name)
          newly.push(name)
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
          newly.push(name)
          count++
        }
      }
    }
    meeting.helpers[svc.key] = arr
  }

  return { weeks: next, count, newly }
}

/**
 * Baut die S-89-Nutzlast für einen belegten Schulungs-Slot (Schulungsaufgabe
 * oder Bibellesung). Liefert null, wenn der Slot leer ist oder keine
 * Schulungsaufgabe (Leser/Leiter zählen nicht). Rahmen und Schulungspunkt
 * werden aus der Meta-Zeile geparst.
 */
export function buildS89ForSlot(weeks: Week[], sel: SlotSelection): S89Payload | null {
  if (sel.kind !== 'part') return null
  const meeting = weeks[sel.wi][sel.tab]
  const item = meeting.sections[sel.si].items[sel.ii]
  if (isSong(item)) return null
  const current = item.names[sel.ni]?.name ?? ''
  if (!current) return null
  const isStudent = sel.priv === 'schulung' || item.title.startsWith('Bibellesung')
  if (!isStudent) return null
  const role = item.names[sel.ni]?.rolle ?? ''
  const metaFrags = (item.meta ?? '').split(' · ')
  const setting =
    metaFrags.find(
      (f) => f === 'Von Haus zu Haus' || f === 'Informell' || f === 'In der Öffentlichkeit',
    ) ?? ''
  const point = metaFrags.find((f) => /^(th|lmd) /.test(f)) ?? ''
  return {
    name: current,
    partner: role.startsWith('mit ') ? role.slice(4) : '',
    date: meeting.date.split(' · ').slice(0, 2).join(' · '),
    type: item.title + (setting ? ` · ${setting}` : ''),
    point,
  }
}

/* ---- Aufgaben-Ableitung (Produktionsmodus) -------------------------------
 * Im Demo-Modus sind "Meine Aufgaben" feste Demo-Daten; mit Persistenz werden
 * sie aus den Wochen-Zuteilungen berechnet. Der Bestätigungs-Status hängt am
 * stabilen Slot-Pfad (taskKey) — verschieben Planer Programmpunkte, wandert
 * der Status bewusst nicht mit (v1-Kompromiss, Status gilt dann als offen).
 */

const TABS: MeetingTab[] = ['mid', 'we']

/** Stabiler Schlüssel eines Programmpunkt-Slots (auch confirmations.task_key). */
export function partTaskKey(wi: number, tab: MeetingTab, si: number, ii: number, ni: number): string {
  return `${wi}|${tab}|part|${si}|${ii}|${ni}`
}

/** Stabiler Schlüssel eines Hilfsdienst-Slots. */
export function helperTaskKey(wi: number, tab: MeetingTab, svc: string, pos: number): string {
  return `${wi}|${tab}|helper|${svc}|${pos}`
}

/** "Dienstag, 8. September · 19:00 · Königreichssaal" → Datum + Uhrzeit. */
function taskDate(meeting: Meeting): string {
  return meeting.date.split(' · ').slice(0, 2).join(' · ')
}

/** Besucht alle belegten Slots (Programmpunkte + Hilfsdienste) aller Wochen. */
function eachAssignedSlot(
  weeks: Week[],
  services: Service[],
  visit: (name: string, key: string, task: () => MyTask) => void,
): void {
  weeks.forEach((week, wi) => {
    for (const tab of TABS) {
      const meeting = week[tab]
      meeting.sections.forEach((section, si) => {
        section.items.forEach((item, ii) => {
          if (isSong(item)) return
          item.names.forEach((slot, ni) => {
            // Gastredner/Kreisaufseher kommen von außen — kein Bestätigungs-Flow
            if (!slot.name || SKIP_ROLE.test(slot.rolle ?? '')) return
            const key = partTaskKey(wi, tab, si, ii, ni)
            visit(slot.name, key, () => {
              const rolle = slot.rolle ?? ''
              const sel: SlotSelection = {
                kind: 'part', wi, tab, si, ii, ni,
                label: '', priv: slot.bereichsKey ?? null, groups: false,
              }
              return {
                id: key,
                title: rolle && !rolle.startsWith('mit ') ? `${item.title} · ${rolle}` : item.title,
                date: taskDate(meeting),
                chip: '',
                status: 'offen',
                s89: buildS89ForSlot(weeks, sel),
              }
            })
          })
        })
      })
      for (const svc of services) {
        if (svc.groups) continue // Gruppen-Rotation hat keine persönliche Aufgabe
        const arr = meeting.helpers[svc.key] ?? []
        for (let pos = 0; pos < svc.count; pos++) {
          const name = arr[pos]
          if (!name) continue
          const key = helperTaskKey(wi, tab, svc.key, pos)
          visit(name, key, () => ({
            id: key,
            title: svc.name,
            date: taskDate(meeting),
            chip: '',
            status: 'offen',
            s89: null,
          }))
        }
      }
    }
  })
}

/**
 * Aufgaben einer Person (Anzeigename) aus den Wochen-Zuteilungen, in
 * Programmreihenfolge; Status aus der ConfirmationMap (fehlt = offen).
 */
export function deriveMyTasks(
  weeks: Week[],
  services: Service[],
  personName: string,
  confirmations: ConfirmationMap,
): MyTask[] {
  const tasks: MyTask[] = []
  if (!personName) return tasks
  eachAssignedSlot(weeks, services, (name, key, task) => {
    if (name !== personName) return
    tasks.push({ ...task(), status: confirmations[key] ?? 'offen' })
  })
  return tasks
}

/**
 * Namen mit mindestens einer noch nicht bestätigten Zuteilung → im Planen
 * als „…“ markiert (verhindert zählt wie offen, bis der Planer neu zuteilt).
 */
export function derivePendingNames(
  weeks: Week[],
  services: Service[],
  confirmations: ConfirmationMap,
): string[] {
  const pending = new Set<string>()
  eachAssignedSlot(weeks, services, (name, key) => {
    if (confirmations[key] !== 'bestätigt') pending.add(name)
  })
  return [...pending]
}

/* ---- „Unser Leben als Christ“ im Planen bearbeiten ---------------------- */

const MIN_RE = /(\d+) Min\./

/** Minuten aus einer Meta-Zeile lesen ("Besprechung · 15 Min." → 15). */
export function itemMinutes(item: PartItem): number | null {
  const match = MIN_RE.exec(item.meta ?? '')
  return match ? Number(match[1]) : null
}

/** Verschiebt "Ende ca. 20:45" um `delta` Minuten (mod 24 h). */
export function shiftEnd(endStr: string, delta: number): string {
  const match = /(\d+):(\d+)/.exec(endStr)
  if (!match) return endStr
  let t = Number(match[1]) * 60 + Number(match[2]) + delta
  t = ((t % 1440) + 1440) % 1440
  const hh = Math.floor(t / 60)
  const mm = String(t % 60).padStart(2, '0')
  return endStr.replace(/\d+:\d+/, `${hh}:${mm}`)
}

/** Indizes der verschiebbaren (Nicht-Lied-)Items einer Sektion. */
function movableIndices(items: Meeting['sections'][number]['items']): number[] {
  return items.map((x, i) => (isSong(x) ? -1 : i)).filter((i) => i >= 0)
}

/** Minuten eines LAC-Punkts ändern (5..45) und Meeting-Ende nachziehen. */
export function lacAdjust(
  weeks: Week[],
  wi: number,
  tab: MeetingTab,
  si: number,
  ii: number,
  delta: number,
): Week[] {
  const next = structuredClone(weeks)
  const meeting = next[wi][tab]
  const item = meeting.sections[si].items[ii]
  if (isSong(item)) return weeks
  const cur = itemMinutes(item)
  if (cur == null) return weeks
  const target = Math.max(5, Math.min(45, cur + delta))
  if (target === cur) return weeks
  item.meta = (item.meta ?? '').replace(MIN_RE, `${target} Min.`)
  meeting.end = shiftEnd(meeting.end, target - cur)
  return next
}

/** LAC-Punkt entfernen und Meeting-Ende um dessen Minuten kürzen. */
export function lacRemove(
  weeks: Week[],
  wi: number,
  tab: MeetingTab,
  si: number,
  ii: number,
): Week[] {
  const next = structuredClone(weeks)
  const meeting = next[wi][tab]
  const item = meeting.sections[si].items[ii]
  const mins = isSong(item) ? null : itemMinutes(item)
  meeting.sections[si].items.splice(ii, 1)
  if (mins != null) meeting.end = shiftEnd(meeting.end, -mins)
  return next
}

/**
 * LAC-Punkt um eine Position verschieben (nur Nicht-Lied-Items tauschen).
 * Die laufenden Nummern bleiben positionsfest.
 */
export function lacMove(
  weeks: Week[],
  wi: number,
  tab: MeetingTab,
  si: number,
  ii: number,
  dir: -1 | 1,
): Week[] {
  const next = structuredClone(weeks)
  const items = next[wi][tab].sections[si].items
  const movables = movableIndices(items)
  const pos = movables.indexOf(ii)
  const tpos = pos + dir
  if (pos < 0 || tpos < 0 || tpos >= movables.length) return weeks
  const a = movables[pos]
  const b = movables[tpos]
  const nums = movables.map((i) => {
    const it = items[i]
    return isSong(it) ? undefined : it.num
  })
  const tmp = items[a]
  items[a] = items[b]
  items[b] = tmp
  movables.forEach((i, k) => {
    const it = items[i]
    if (!isSong(it)) it.num = nums[k]
  })
  return next
}

/**
 * Neuen LAC-Punkt (10 Min.) vor dem Versammlungsbibelstudium einfügen und
 * Meeting-Ende um 10 Min. verlängern. Leerer Titel → keine Änderung.
 */
export function lacAdd(
  weeks: Week[],
  wi: number,
  tab: MeetingTab,
  si: number,
  title: string,
): Week[] {
  const trimmed = title.trim()
  if (!trimmed) return weeks
  const next = structuredClone(weeks)
  const meeting = next[wi][tab]
  const items = meeting.sections[si].items
  const vbsIdx = items.findIndex(
    (x) => !isSong(x) && x.title.startsWith('Versammlungsbibelstudium'),
  )
  const newItem: PartItem = { title: trimmed, meta: '10 Min.', names: [{ name: '', bereichsKey: 'vortrag' }] }
  items.splice(vbsIdx >= 0 ? vbsIdx : items.length, 0, newItem)
  meeting.end = shiftEnd(meeting.end, 10)
  return next
}
