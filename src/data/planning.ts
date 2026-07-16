/**
 * Zuteilungslogik — Kernregeln aus dem Design-Handoff ("Interaktionen &
 * Verhalten"): nur Qualifizierte, Abwesende blockiert, Auslastung über alle
 * geladenen Wochen, Auto-Zuteilung wählt geringste Auslastung, Reinigung
 * rotiert über die Predigtdienstgruppen (Wochenindex mod Gruppenzahl),
 * Gastredner-Slots werden übersprungen.
 *
 * Alle Funktionen sind pur (Eingaben bleiben unverändert) — geeignet für
 * den Reducer und später direkt testbar.
 */

import {
  displayName,
  isQualified,
  isSong,
  partWorkload,
  serviceQualKey,
  workloadOf,
} from './helpers'
import type {
  ConfirmationMap,
  Group,
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

const EROEFFNUNG = 'ERÖFFNUNG'
const WT_STUDIUM = 'WACHTTURM-STUDIUM'

/** Gleitendes Fenster für die Strichliste: N Wochen davor + N danach. */
const WINDOW = 3

/** Kleiner, stabiler String-Hash für faire, deterministische Tie-Breaks. */
function tieHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h >>> 0
}

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
  unfilled: number // offen gebliebene Slots ohne passenden/freien Kandidaten
}

/**
 * Auto-Zuteilung für eine Woche+Meeting. Regeln (siehe README/Design):
 *  - Kandidaten: qualifiziert, in dieser Woche anwesend, noch nicht in diesem
 *    Meeting eingeteilt. Niemand bekommt Hilfsdienst UND Programmpunkt am
 *    selben Tag (gemeinsame `used`-Menge; Ausnahme Vorsitz+Gebet).
 *  - Ausgeglichene Verteilung über zwei mitlaufende „Strichlisten“ innerhalb
 *    eines gleitenden Fensters (±WINDOW Wochen um die geplante Woche):
 *      • Aufgaben (Programmpunkte) werden nach der reinen **Aufgaben**-Last
 *        verteilt — unabhängig von Hilfsdiensten, damit sie regelmäßig bleiben.
 *      • Hilfsdienste nach der **Gesamt**-Last — wer viele Aufgaben hat, bekommt
 *        weniger Hilfsdienste (aber nicht umgekehrt).
 *    Bei Gleichstand fairer, deterministischer Tie-Break.
 *  - Vorsitz betet zu Beginn: Anfangsgebet wird als Standard an die
 *    Vorsitz-Person gekoppelt (die einzige erlaubte Doppel-Aufgabe).
 *  - Fester Wachtturm-Studium-Leiter (bzw. Vertreter bei Abwesenheit) wird
 *    zuerst reserviert, damit ihn kein anderer Slot „wegnimmt“.
 *  - Nicht besetzbare Slots bleiben offen (kein Kandidat verfügbar).
 */
export function autoAssignMeeting(
  weeks: Week[],
  weekIndex: number,
  tab: MeetingTab,
  persons: Person[],
  services: Service[],
  groups: Group[] = [],
): AutoAssignResult {
  const next = structuredClone(weeks)
  const meeting = next[weekIndex][tab]

  // Reinigungs-Regel: Aufseher und Gehilfe der Gruppe, die in dieser Woche
  // reinigt, sollen möglichst keinen weiteren Hilfsdienst bekommen (sie sind mit
  // der Reinigung beschäftigt). Umgesetzt als weicher Malus bei der
  // Hilfsdienst-Auswahl — greift nur, solange genug andere Kandidaten da sind.
  const cleaningGroup = groups.length ? groups[weekIndex % groups.length] : null
  const cleaningLeaders = new Set<string>()
  for (const pid of [cleaningGroup?.ov, cleaningGroup?.as]) {
    const person = pid ? persons.find((p) => p.id === pid) : undefined
    if (person) cleaningLeaders.add(displayName(person))
  }
  const HELPER_MALUS = 1e6

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

  // Gleitendes Fenster: nur ±WINDOW Wochen um die geplante Woche zählen, damit
  // uralte Einteilungen die aktuelle Verteilung nicht verzerren.
  const lo = Math.max(0, weekIndex - WINDOW)
  const hi = Math.min(weeks.length - 1, weekIndex + WINDOW)
  const windowWeeks = weeks.slice(lo, hi + 1)

  // Zwei Live-Strichlisten (Startwert aus dem Fenster, während des Laufs
  // hochgezählt): partLoad = nur Aufgaben, totalLoad = Aufgaben + Hilfsdienste.
  const partLoad = new Map<string, number>()
  const totalLoad = new Map<string, number>()
  const pl = (name: string): number => partLoad.get(name) ?? partWorkload(windowWeeks, name)
  const tl = (name: string): number => totalLoad.get(name) ?? workloadOf(windowWeeks, name)

  let count = 0
  let unfilled = 0
  const newly: string[] = []

  const claim = (kind: 'part' | 'helper', name: string): void => {
    used.add(name)
    totalLoad.set(name, tl(name) + 1)
    if (kind === 'part') partLoad.set(name, pl(name) + 1)
    newly.push(name)
    count++
  }

  const pick = (kind: 'part' | 'helper', priv: string | null | undefined): string | null => {
    const load = kind === 'part' ? pl : tl // Aufgaben nach Aufgaben-Last, Hilfsdienste nach Gesamtlast
    // Bei Hilfsdiensten den Aufsehern/Gehilfen der Reinigungsgruppe einen Malus
    // geben, damit sie nur als letzte Wahl einen weiteren Dienst bekommen.
    const eff = (name: string): number =>
      load(name) + (kind === 'helper' && cleaningLeaders.has(name) ? HELPER_MALUS : 0)
    const candidates = persons
      .filter((p) => (!priv || isQualified(p, priv)) && !p.absent.includes(weekIndex))
      .map((p) => displayName(p))
      .filter((name) => !used.has(name))
    if (candidates.length === 0) return null
    candidates.sort(
      (a, b) =>
        eff(a) - eff(b) ||
        tieHash(`${a}|${weekIndex}|${tab}`) - tieHash(`${b}|${weekIndex}|${tab}`),
    )
    return candidates[0]
  }

  // Fester Wachtturm-Studium-Leiter, sonst Vertreter (beide anwesend + frei),
  // sonst normale Auswahl unter allen „studium“-Qualifizierten.
  const pickConductor = (): string | null => {
    const designated = (flag: 'wtLeiter' | 'wtVertreter'): string | undefined => {
      const person = persons.find(
        (p) => p.priv[flag] && !p.absent.includes(weekIndex) && !used.has(displayName(p)),
      )
      return person ? displayName(person) : undefined
    }
    return designated('wtLeiter') ?? designated('wtVertreter') ?? pick('part', 'studium')
  }

  // 1) WT-Studium-Leiter zuerst reservieren (nur Wochenende hat diese Sektion).
  for (const section of meeting.sections) {
    if (section.label !== WT_STUDIUM) continue
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (slot.rolle === 'Leiter' && !slot.name) {
          const name = pickConductor()
          if (name) {
            slot.name = name
            claim('part', name)
          } else {
            unfilled++
          }
        }
      }
    }
  }

  // 2) Übrige Programmpunkte. Das Anfangsgebet (Eröffnung) wird übersprungen
  //    und unten an den Vorsitz gekoppelt.
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue
        if (section.label === EROEFFNUNG && slot.rolle === 'Gebet') continue
        const name = pick('part', slot.bereichsKey)
        if (name) {
          slot.name = name
          claim('part', name)
        } else {
          unfilled++
        }
      }
    }
  }

  // 3) Vorsitz betet zu Beginn (Standard, manuell änderbar): Anfangsgebet =
  //    Vorsitz-Person, sofern das Gebet noch offen ist.
  const opening = meeting.sections.find((s) => s.label === EROEFFNUNG)
  if (opening) {
    const openingSlots = opening.items.flatMap((i) => (isSong(i) ? [] : i.names))
    const vorsitz = openingSlots.find((s) => s.rolle === 'Vorsitz')?.name
    const gebet = openingSlots.find((s) => s.rolle === 'Gebet')
    if (vorsitz && gebet && !gebet.name) {
      gebet.name = vorsitz
      totalLoad.set(vorsitz, tl(vorsitz) + 1)
      partLoad.set(vorsitz, pl(vorsitz) + 1)
      count++
    }
  }

  // 4) Hilfsdienste (nach den Programmpunkten → Helfer und Aufgaben schließen
  //    sich über `used` gegenseitig aus; Auswahl nach Gesamtlast).
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if (arr[pos]) continue
      while (arr.length <= pos) arr.push('')
      if (svc.groups) {
        // Reinigung rotiert über die echten Predigtdienstgruppen; ohne
        // konfigurierte Gruppen Fallback auf die alte Gruppe-1–3-Rotation.
        arr[pos] = cleaningGroup ? cleaningGroup.name : `Gruppe ${1 + (weekIndex % 3)}`
        count++
      } else {
        const name = pick('helper', serviceQualKey(svc.key))
        if (name) {
          arr[pos] = name
          claim('helper', name)
        } else {
          unfilled++
        }
      }
    }
    meeting.helpers[svc.key] = arr
  }

  return { weeks: next, count, newly, unfilled }
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

/* ---- Konfliktprüfungen (Planen) ------------------------------------------
 * Warnungen für den Planer, aus den Wochen abgeleitet: jemand ist trotz
 * Abwesenheit eingeteilt, mehrfach in derselben Zusammenkunft, oder über
 * mehrere Wochen am Stück eingeteilt. Reine Ableitung, keine Persistenz.
 */

/** Ab wie vielen Wochen in Folge ein „streak“-Konflikt entsteht. */
const STREAK_THRESHOLD = 3

export type ConflictKind = 'absent' | 'double' | 'helperTask' | 'streak'

export interface Conflict {
  kind: ConflictKind
  name: string // Anzeigename der Person
  tab?: MeetingTab // betroffene Zusammenkunft (absent/double/helperTask)
  count?: number // double: Slots in der Zusammenkunft; streak: Wochen in Folge
}

/**
 * Belegte Personen-Namen einer Zusammenkunft (mit Duplikaten). Ohne Lieder,
 * ohne externe Slots (Gastredner/Kreisaufseher) und ohne Gruppen-Rotation —
 * die sind keine zuteilbaren Personen.
 */
/** Belegte Namen der Programmpunkte (ohne Lieder, ohne externe Slots). */
function meetingPartNames(meeting: Meeting): string[] {
  const names: string[] = []
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (!slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue
        names.push(slot.name)
      }
    }
  }
  return names
}

/** Belegte Namen der Hilfsdienste (ohne Gruppen-Rotation). */
function meetingHelperNames(meeting: Meeting, services: Service[]): string[] {
  const names: string[] = []
  for (const svc of services) {
    if (svc.groups) continue
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if (arr[pos]) names.push(arr[pos])
    }
  }
  return names
}

function meetingAssignedNames(meeting: Meeting, services: Service[]): string[] {
  return [...meetingPartNames(meeting), ...meetingHelperNames(meeting, services)]
}

/** Alle belegten Namen einer Woche (beide Zusammenkünfte), als Menge. */
function weekAssignedNames(week: Week, services: Service[]): Set<string> {
  return new Set([
    ...meetingAssignedNames(week.mid, services),
    ...meetingAssignedNames(week.we, services),
  ])
}

/**
 * Konflikte der Woche `wi`: Abwesende trotz Zuteilung, Mehrfach-Zuteilung in
 * einer Zusammenkunft und Serien von `STREAK_THRESHOLD`+ Wochen in Folge
 * (die `wi` enthalten). Reihenfolge: absent, double, streak.
 */
export function weekConflicts(
  weeks: Week[],
  wi: number,
  persons: Person[],
  services: Service[],
): Conflict[] {
  const week = weeks[wi]
  if (!week) return []
  const conflicts: Conflict[] = []
  const byDisplay = new Map(persons.map((p) => [displayName(p), p]))
  const tabs: MeetingTab[] = ['mid', 'we']

  // absent: in dieser Woche abwesend, aber eingeteilt
  for (const tab of tabs) {
    for (const name of new Set(meetingAssignedNames(week[tab], services))) {
      const person = byDisplay.get(name)
      if (person && person.absent.includes(wi)) {
        conflicts.push({ kind: 'absent', name, tab })
      }
    }
  }

  // helperTask / double: gleiche Person mehrfach in einer Zusammenkunft.
  // helperTask = Hilfsdienst UND Programmpunkt am selben Tag (die vom Nutzer
  // vorgegebene Regel — bei manueller Zuteilung nicht automatisch verhindert);
  // double = sonstige Mehrfach-Zuteilung (2× Programm oder 2× Hilfsdienst).
  for (const tab of tabs) {
    const partCounts = new Map<string, number>()
    for (const name of meetingPartNames(week[tab])) {
      partCounts.set(name, (partCounts.get(name) ?? 0) + 1)
    }
    const helperCounts = new Map<string, number>()
    for (const name of meetingHelperNames(week[tab], services)) {
      helperCounts.set(name, (helperCounts.get(name) ?? 0) + 1)
    }
    for (const name of new Set([...partCounts.keys(), ...helperCounts.keys()])) {
      const pc = partCounts.get(name) ?? 0
      const hc = helperCounts.get(name) ?? 0
      if (pc >= 1 && hc >= 1) conflicts.push({ kind: 'helperTask', name, tab })
      else if (pc + hc >= 2) conflicts.push({ kind: 'double', name, tab, count: pc + hc })
    }
  }

  // streak: Häufung von STREAK_THRESHOLD+ Wochen am Stück. Bewusst nur, wenn
  // der Lauf kürzer als der geladene Zeitraum ist — wer schlicht in *jeder*
  // Woche eingeteilt ist, ist durchgehend aktiv (Auslastungsthema), keine
  // auffällige Serie, und würde sonst nur Rauschen erzeugen.
  const nameSets = weeks.map((w) => weekAssignedNames(w, services))
  for (const name of nameSets[wi]) {
    let start = wi
    let end = wi
    while (start - 1 >= 0 && nameSets[start - 1].has(name)) start--
    while (end + 1 < weeks.length && nameSets[end + 1].has(name)) end++
    const run = end - start + 1
    if (run >= STREAK_THRESHOLD && run < weeks.length) {
      conflicts.push({ kind: 'streak', name, count: run })
    }
  }

  return conflicts
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
