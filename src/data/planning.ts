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

import { LABEL_EROEFFNUNG, LABEL_WT_STUDIUM } from './constants'
import {
  displayName,
  isPlainPublisher,
  isQualified,
  isSong,
  partnerGenderOk,
  partWorkload,
  serviceQualKey,
  workloadOf,
} from './helpers'
import { meetingDateMs, meetingDayOffsets } from './meeting-dates'
import type {
  ConfirmationMap,
  Group,
  Meeting,
  MeetingKey,
  MeetingSlotSelection,
  MyTask,
  PartItem,
  Person,
  S89Payload,
  Service,
  SlotAssignment,
  SlotSelection,
  Week,
} from './types'

/** Rollen, die die Auto-Zuteilung nicht besetzt (kommen von außen). */
const SKIP_ROLE = /Gastredner|Kreisaufseher/

/** Externer Redner-Slot (Gastredner/Kreisaufseher) — Freitext statt Personenliste. */
export function isGuestRole(rolle: string | undefined): boolean {
  return Boolean(rolle && SKIP_ROLE.test(rolle))
}


/** Gleitendes Fenster für die Strichliste: N Wochen davor + N danach. */
const WINDOW = 3

/** Kleiner, stabiler String-Hash für faire, deterministische Tie-Breaks. */
function tieHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h >>> 0
}

/** Aktueller Name auf einem Slot ("" = offen). */
export function slotValue(weeks: Week[], sel: MeetingSlotSelection): string {
  const meeting = weeks[sel.wi][sel.tab]
  if (sel.kind === 'part') {
    const item = meeting.sections[sel.si].items[sel.ii]
    return isSong(item) ? '' : (item.names[sel.ni]?.name ?? '')
  }
  return meeting.helpers[sel.svc]?.[sel.pos]?.name ?? ''
}

/**
 * Eine bereits bestehende Zuteilung einer Person in einer Zusammenkunft — für
 * den Doppelbelegungs-Hinweis im Zuteilungs-Sheet.
 * `lang` steuert die Übersetzung bei der Anzeige: 'u' = App-Sprache
 * (Rollen/Dienstnamen), 'p' = Versammlungssprache (Programmpunkt-Titel).
 */
export interface MeetingAssignment {
  text: string
  lang: 'u' | 'p'
}

/**
 * Alle Zuteilungen, die `name` in dieser Zusammenkunft schon hat (Programmpunkte
 * + Hilfsdienste), außer dem gerade bearbeiteten Slot `exclude`. Damit sieht der
 * Planer beim Zuteilen, wen er am selben Tag nicht versehentlich doppelt verplant.
 */
export function assignmentsInMeeting(
  meeting: Meeting,
  name: string,
  services: Service[],
  exclude?: SlotSelection,
): MeetingAssignment[] {
  if (!name) return []
  const out: MeetingAssignment[] = []
  meeting.sections.forEach((section, si) => {
    section.items.forEach((item, ii) => {
      if (isSong(item)) return
      item.names.forEach((slot, ni) => {
        if (slot.name !== name) return
        if (exclude?.kind === 'part' && exclude.si === si && exclude.ii === ii && exclude.ni === ni) return
        const rolle = slot.rolle ?? ''
        // Rolle bevorzugen (Vorsitz/Gebet/Leiter/Leser …); Begleiter-Label
        // ("mit …") ignorieren und stattdessen den Programmpunkt-Titel zeigen.
        if (rolle && !rolle.startsWith('mit')) out.push({ text: rolle, lang: 'u' })
        else out.push({ text: item.title, lang: 'p' })
      })
    })
  })
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    arr.forEach((slot, pos) => {
      if (slot.name !== name) return
      if (exclude?.kind === 'helper' && exclude.svc === svc.key && exclude.pos === pos) return
      out.push({ text: svc.name, lang: 'u' })
    })
  }
  return out
}

/** Setzt einen Slot auf `name` ("" = Zuteilung entfernen). */
export function assignSlot(
  weeks: Week[],
  sel: MeetingSlotSelection,
  name: string,
  rolle?: string,
  pid?: string,
): Week[] {
  const next = structuredClone(weeks)
  const meeting = next[sel.wi][sel.tab]
  if (sel.kind === 'part') {
    const item = meeting.sections[sel.si].items[sel.ii]
    if (!isSong(item)) {
      const slot = item.names[sel.ni]
      slot.name = name
      // Person-Id als stabile Identität mitführen; beim Entfernen bzw. bei
      // externen Rednern (kein pid) das Feld sauber löschen.
      if (name && pid) slot.pid = pid
      else delete slot.pid
      // Gastredner-Slots: Rolle trägt die Herkunfts-Versammlung mit
      // ("Gastredner · Vers. Nordheim")
      if (rolle !== undefined) slot.rolle = rolle
    }
  } else {
    const arr = meeting.helpers[sel.svc] ?? []
    while (arr.length <= sel.pos) arr.push({ name: '' })
    arr[sel.pos] = name && pid ? { name, pid } : { name }
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
    for (let pos = 0; pos < svc.count; pos++) if (!arr[pos]?.name) count++
  }
  return count
}

/**
 * task_keys aller Slots, deren Besetzung sich zwischen zwei Ständen derselben
 * Zusammenkunft geändert hat (Zuteilen, Entfernen, Auto-Zuteilung). Für diese
 * Slots wird der Bestätigungs-Status abgeräumt — sonst erbt die neu
 * eingeteilte Person ein fremdes „bestätigt“/„verhindert“.
 */
export function changedSlotKeys(
  prev: Meeting,
  next: Meeting,
  services: Service[],
  wi: number,
  tab: MeetingKey,
): string[] {
  const keys: string[] = []
  next.sections.forEach((section, si) => {
    section.items.forEach((item, ii) => {
      if (isSong(item)) return
      const prevItem = prev.sections[si]?.items[ii]
      const prevNames = prevItem && !isSong(prevItem) ? prevItem.names : []
      item.names.forEach((slot, ni) => {
        if ((prevNames[ni]?.name ?? '') !== slot.name) keys.push(partTaskKey(wi, tab, si, ii, ni))
      })
    })
  })
  for (const svc of services) {
    const prevArr = prev.helpers[svc.key] ?? []
    const nextArr = next.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if ((prevArr[pos]?.name ?? '') !== (nextArr[pos]?.name ?? ''))
        keys.push(helperTaskKey(wi, tab, svc.key, pos))
    }
  }
  return keys
}

/** Offener Slot fürs Planen-Banner (lang wie MeetingAssignment: 'u'|'p'). */
export interface OpenSlot {
  text: string
  lang: 'u' | 'p'
  n: number // Anzahl offener Plätze (Hilfsdienste können mehrere haben)
}

/**
 * Offene Slots einer Zusammenkunft mit Beschriftung — gleiche Konvention wie
 * assignmentsInMeeting: Rolle bevorzugt (App-Sprache), sonst Titel
 * (Programmsprache); Hilfsdienste je Dienst gebündelt mit Anzahl.
 */
export function openSlotLabels(meeting: Meeting, services: Service[]): OpenSlot[] {
  const out: OpenSlot[] = []
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (slot.name) continue
        const rolle = slot.rolle ?? ''
        out.push(
          rolle && !rolle.startsWith('mit')
            ? { text: `${item.title} · ${rolle}`, lang: 'p', n: 1 }
            : { text: item.title, lang: 'p', n: 1 },
        )
      }
    }
  }
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    let n = 0
    for (let pos = 0; pos < svc.count; pos++) if (!arr[pos]?.name) n++
    if (n > 0) out.push({ text: svc.name, lang: 'u', n })
  }
  return out
}

export interface AutoAssignResult {
  weeks: Week[]
  count: number // Anzahl vergebener Zuteilungen
  newly: string[] // neu vergebene Personennamen (→ pendingNames)
  unfilled: number // offen gebliebene Slots ohne passenden/freien Kandidaten
}

/** Umfang der Auto-Zuteilung: nur Programmpunkte, nur Hilfsdienste, oder beides. */
export type AssignScope = 'all' | 'parts' | 'helpers'

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
  tab: MeetingKey,
  persons: Person[],
  services: Service[],
  groups: Group[] = [],
  scope: AssignScope = 'all',
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
    for (const slot of arr) if (slot.name) used.add(slot.name)
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

  // Umfang: Programmpunkte (Aufgaben) und/oder Hilfsdienste getrennt zuteilbar.
  const doParts = scope !== 'helpers'
  const doHelpers = scope !== 'parts'

  const claim = (kind: 'part' | 'helper', name: string): void => {
    used.add(name)
    totalLoad.set(name, tl(name) + 1)
    if (kind === 'part') partLoad.set(name, pl(name) + 1)
    newly.push(name)
    count++
  }

  const pick = (
    kind: 'part' | 'helper',
    priv: string | null | undefined,
    opts: { extra?: (p: Person) => boolean; byTotal?: boolean; malus?: (p: Person) => boolean } = {},
  ): Person | null => {
    // Aufgaben nach Aufgaben-Last, Hilfsdienste nach Gesamtlast. byTotal erzwingt
    // die Gesamtlast auch für Aufgaben — für Schülerteile, damit Schwestern (die
    // sonst wenig Last tragen) automatisch häufiger drankommen, Brüder aber nicht.
    const load = opts.byTotal || kind === 'helper' ? tl : pl
    // Malus (letzte Wahl): Reinigungs-Aufseher bei Hilfsdiensten; zusätzlich der
    // per opts.malus markierte Kreis (z. B. Älteste/DAG bei Gesprächsteilen).
    const eff = (p: Person): number => {
      const name = displayName(p)
      let e = load(name)
      if (kind === 'helper' && cleaningLeaders.has(name)) e += HELPER_MALUS
      if (opts.malus?.(p)) e += HELPER_MALUS
      return e
    }
    const candidates = persons.filter(
      (p) =>
        (!priv || isQualified(p, priv)) &&
        !p.absent.includes(weekIndex) &&
        (!opts.extra || opts.extra(p)) &&
        !used.has(displayName(p)),
    )
    if (candidates.length === 0) return null
    candidates.sort(
      (a, b) =>
        eff(a) - eff(b) ||
        tieHash(`${displayName(a)}|${weekIndex}|${tab}`) -
          tieHash(`${displayName(b)}|${weekIndex}|${tab}`),
    )
    return candidates[0]
  }

  /**
   * Auswahl-Optionen für einen Schülerteil-Slot (gold): Vortrag → männlich;
   * Gesprächsführer/-partner → Gesamtlast (Schwestern zuerst), Älteste/DAG nur
   * als letzte Wahl (Malus); Partner zusätzlich gleiches Geschlecht wie der Führer.
   */
  const ministryOpts = (item: PartItem, slot: SlotAssignment) => {
    if (slot.male) return { extra: (p: Person) => !p.female }
    if (slot.bereichsKey === 'schulung') {
      return { byTotal: true, malus: (p: Person) => !isPlainPublisher(p) }
    }
    if (slot.bereichsKey === 'schulungPartner') {
      const leadName = item.names.find((n) => n.bereichsKey === 'schulung')?.name ?? ''
      const lead = leadName ? persons.find((p) => displayName(p) === leadName) : undefined
      return {
        byTotal: true,
        malus: (p: Person) => !isPlainPublisher(p),
        extra: (p: Person) => partnerGenderOk(lead, p),
      }
    }
    return {}
  }

  // Fester Wachtturm-Studium-Leiter, sonst Vertreter (beide anwesend + frei),
  // sonst normale Auswahl unter allen „studium“-Qualifizierten.
  const pickConductor = (): Person | null => {
    const designated = (flag: 'wtLeiter' | 'wtVertreter'): Person | undefined =>
      persons.find(
        (p) => p.priv[flag] && !p.absent.includes(weekIndex) && !used.has(displayName(p)),
      )
    return designated('wtLeiter') ?? designated('wtVertreter') ?? pick('part', 'studium')
  }

  if (doParts) {
  // 1) WT-Studium-Leiter zuerst reservieren (nur Wochenende hat diese Sektion).
  for (const section of meeting.sections) {
    if (section.label !== LABEL_WT_STUDIUM) continue
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (slot.rolle === 'Leiter' && !slot.name) {
          const person = pickConductor()
          if (person) {
            slot.name = displayName(person)
            slot.pid = person.id
            claim('part', slot.name)
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
        if (section.label === LABEL_EROEFFNUNG && slot.rolle === 'Gebet') continue
        // Schülerteile (gold): Geschlecht/Partner/Verteilung berücksichtigen.
        const person = pick('part', slot.bereichsKey, ministryOpts(item, slot))
        if (person) {
          slot.name = displayName(person)
          slot.pid = person.id
          claim('part', slot.name)
        } else {
          unfilled++
        }
      }
    }
  }

  // 3) Vorsitz betet zu Beginn (Standard, manuell änderbar): Anfangsgebet =
  //    Vorsitz-Person, sofern das Gebet noch offen ist.
  const opening = meeting.sections.find((s) => s.label === LABEL_EROEFFNUNG)
  if (opening) {
    const openingSlots = opening.items.flatMap((i) => (isSong(i) ? [] : i.names))
    const vorsitzSlot = openingSlots.find((s) => s.rolle === 'Vorsitz')
    const vorsitz = vorsitzSlot?.name
    const gebet = openingSlots.find((s) => s.rolle === 'Gebet')
    if (vorsitz && gebet && !gebet.name) {
      gebet.name = vorsitz
      if (vorsitzSlot?.pid) gebet.pid = vorsitzSlot.pid // dieselbe Person betet
      totalLoad.set(vorsitz, tl(vorsitz) + 1)
      partLoad.set(vorsitz, pl(vorsitz) + 1)
      count++
    }
  }

  } // Ende Programmpunkte (doParts)

  if (doHelpers) {
  // 4) Hilfsdienste (nach den Programmpunkten → Helfer und Aufgaben schließen
  //    sich über `used` gegenseitig aus; Auswahl nach Gesamtlast).
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if (arr[pos]?.name) continue
      while (arr.length <= pos) arr.push({ name: '' })
      if (svc.groups) {
        // Reinigung rotiert über die echten Predigtdienstgruppen (keine Person,
        // daher keine pid); ohne konfigurierte Gruppen Fallback auf 1–3.
        arr[pos] = { name: cleaningGroup ? cleaningGroup.name : `Gruppe ${1 + (weekIndex % 3)}` }
        count++
      } else {
        const person = pick('helper', serviceQualKey(svc.key))
        if (person) {
          arr[pos] = { name: displayName(person), pid: person.id }
          claim('helper', arr[pos].name)
        } else {
          unfilled++
        }
      }
    }
    meeting.helpers[svc.key] = arr
  }
  } // Ende Hilfsdienste (doHelpers)

  return { weeks: next, count, newly, unfilled }
}

/**
 * Leert die Zuteilungen einer Woche+Meeting — das Gegenstück zur Auto-Zuteilung.
 * `scope`:
 *  - 'parts'   entfernt die Namen der Programmpunkte. Externe Redner
 *    (Gastredner/Kreisaufseher) bleiben stehen, genau wie die Auto-Zuteilung sie
 *    nicht besetzt — sie kommen von außen und werden manuell eingetragen.
 *  - 'helpers' entfernt die Namen aller Hilfsdienste (inkl. Reinigungsgruppe).
 * Programmstruktur, Rollen, Vortragsthemen und Lieder bleiben unverändert.
 * Pur — die Eingabe bleibt unangetastet. `count` = Anzahl geleerter Slots.
 */
export function clearAssignments(
  weeks: Week[],
  weekIndex: number,
  tab: MeetingKey,
  scope: Exclude<AssignScope, 'all'>,
): { weeks: Week[]; count: number } {
  const next = structuredClone(weeks)
  const meeting = next[weekIndex][tab]
  let count = 0
  if (scope === 'parts') {
    for (const section of meeting.sections) {
      for (const item of section.items) {
        if (isSong(item)) continue
        for (const slot of item.names) {
          if (SKIP_ROLE.test(slot.rolle ?? '')) continue // externer Redner bleibt
          if (slot.name) {
            slot.name = ''
            count++
          }
        }
      }
    }
  } else {
    for (const key of Object.keys(meeting.helpers)) {
      const arr = meeting.helpers[key] ?? []
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].name) {
          arr[i] = { name: '' }
          count++
        }
      }
      meeting.helpers[key] = arr
    }
  }
  return { weeks: next, count }
}

/**
 * Baut die S-89-Nutzlast für einen belegten Schulungs-Slot (Schulungsaufgabe
 * oder Bibellesung). Liefert null, wenn der Slot leer ist oder keine
 * Schulungsaufgabe (Leser/Leiter zählen nicht). Rahmen und Schulungspunkt
 * werden aus der Meta-Zeile geparst.
 */
export function buildS89ForSlot(weeks: Week[], sel: MeetingSlotSelection): S89Payload | null {
  if (sel.kind !== 'part') return null
  const meeting = weeks[sel.wi][sel.tab]
  const item = meeting.sections[sel.si].items[sel.ii]
  if (isSong(item)) return null
  const slot = item.names[sel.ni]
  const current = slot?.name ?? ''
  if (!current) return null
  const isStudent =
    sel.priv === 'schulung' || sel.priv === 'schulungPartner' || item.title.startsWith('Bibellesung')
  if (!isStudent) return null
  // Hauptteilnehmer (schulung) und Gesprächspartner (schulungPartner) stehen als
  // getrennte Slots im selben Punkt. Alt-Daten trugen den Partner als "mit X" im
  // Rollentext — als Rückfall weiter unterstützt.
  const leadName = item.names.find((n) => n.bereichsKey === 'schulung')?.name ?? ''
  const partnerName = item.names.find((n) => n.bereichsKey === 'schulungPartner')?.name ?? ''
  const role = slot?.rolle ?? ''
  const legacyPartner = role.startsWith('mit ') ? role.slice(4) : ''
  const metaFrags = (item.meta ?? '').split(' · ')
  const setting =
    metaFrags.find(
      (f) => f === 'Von Haus zu Haus' || f === 'Informell' || f === 'In der Öffentlichkeit',
    ) ?? ''
  const point = metaFrags.find((f) => /^(th|lmd) /.test(f)) ?? ''
  return {
    name: leadName || current, // Bibellesung hat keinen schulung-Slot → aktueller Name
    partner: partnerName || legacyPartner,
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

const TABS: MeetingKey[] = ['mid', 'we']

/** Stabiler Schlüssel eines Programmpunkt-Slots (auch confirmations.task_key). */
export function partTaskKey(wi: number, tab: MeetingKey, si: number, ii: number, ni: number): string {
  return `${wi}|${tab}|part|${si}|${ii}|${ni}`
}

/** Stabiler Schlüssel eines Hilfsdienst-Slots. */
export function helperTaskKey(wi: number, tab: MeetingKey, svc: string, pos: number): string {
  return `${wi}|${tab}|helper|${svc}|${pos}`
}

/**
 * task_key-Paare zweier getauschter Programmpunkt-Positionen (LAC verschieben).
 * Für ni = 0..count-1 wird `part|si|a|ni` mit `part|si|b|ni` vertauscht — so
 * folgt die Bestätigung dem Programmpunkt statt der Position.
 */
export function partSwapKeyPairs(
  wi: number,
  tab: MeetingKey,
  si: number,
  a: number,
  b: number,
  count: number,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let ni = 0; ni < count; ni++) {
    pairs.push([partTaskKey(wi, tab, si, a, ni), partTaskKey(wi, tab, si, b, ni)])
  }
  return pairs
}

/** Bestätigungs-Status zweier getauschter Positionen in der Map vertauschen. */
export function swapPartConfirmations(
  map: ConfirmationMap,
  wi: number,
  tab: MeetingKey,
  si: number,
  a: number,
  b: number,
  count: number,
): ConfirmationMap {
  const next = { ...map }
  let changed = false
  for (const [ka, kb] of partSwapKeyPairs(wi, tab, si, a, b, count)) {
    const va = map[ka]
    const vb = map[kb]
    if (va === vb) continue
    if (vb === undefined) delete next[ka]
    else next[ka] = vb
    if (va === undefined) delete next[kb]
    else next[kb] = va
    changed = true
  }
  return changed ? next : map
}

/** "Dienstag, 8. September · 19:00 · Königreichssaal" → Datum + Uhrzeit. */
function taskDate(meeting: Meeting): string {
  return meeting.date.split(' · ').slice(0, 2).join(' · ')
}

/** Besucht alle belegten Slots (Programmpunkte + Hilfsdienste) aller Wochen. */
function eachAssignedSlot(
  weeks: Week[],
  services: Service[],
  meetings: string,
  visit: (name: string, key: string, task: () => MyTask, pid?: string) => void,
): void {
  const offsets = meetingDayOffsets(meetings)
  weeks.forEach((week, wi) => {
    for (const tab of TABS) {
      const meeting = week[tab]
      // Echtes Datum der Zusammenkunft (nur bei importierten Wochen) → Countdown.
      const at = meetingDateMs(week.start, offsets[tab])
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
                at,
                status: 'offen',
                s89: buildS89ForSlot(weeks, sel),
              }
            }, slot.pid)
          })
        })
      })
      for (const svc of services) {
        if (svc.groups) continue // Gruppen-Rotation hat keine persönliche Aufgabe
        const arr = meeting.helpers[svc.key] ?? []
        for (let pos = 0; pos < svc.count; pos++) {
          const slot = arr[pos]
          if (!slot?.name) continue
          const key = helperTaskKey(wi, tab, svc.key, pos)
          visit(slot.name, key, () => ({
            id: key,
            title: svc.name,
            date: taskDate(meeting),
            chip: '',
            at,
            status: 'offen',
            s89: null,
          }), slot.pid)
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
  meetings = '',
  personId?: string,
): MyTask[] {
  const tasks: MyTask[] = []
  if (!personName && !personId) return tasks
  eachAssignedSlot(weeks, services, meetings, (name, key, task, pid) => {
    // Stabile Zuordnung über die Person-Id, wenn der Slot eine trägt (und wir
    // die Id kennen). Sonst Rückfall auf den Anzeigenamen (Hilfsdienste,
    // externe Redner, Altdaten) — verhindert, dass Namensgleiche fremde
    // Aufgaben sehen.
    const mine = pid && personId ? pid === personId : name === personName
    if (!mine) return
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
  // meetings ist für die reine Namensmenge irrelevant (kein Countdown nötig).
  eachAssignedSlot(weeks, services, '', (name, key) => {
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
  tab?: MeetingKey // betroffene Zusammenkunft (absent/double/helperTask)
  count?: number // double: Hilfsdienste in der Zusammenkunft; streak: Wochen in Folge
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
      if (arr[pos]?.name) names.push(arr[pos].name)
    }
  }
  return names
}

function meetingAssignedNames(meeting: Meeting, services: Service[]): string[] {
  return [...meetingPartNames(meeting), ...meetingHelperNames(meeting, services)]
}

/**
 * Konflikte der Woche `wi`: Abwesende trotz Zuteilung, Mehrfach-Zuteilung in
 * einer Zusammenkunft und Serien von `STREAK_THRESHOLD`+ Wochen in Folge
 * (die `wi` enthalten). Reihenfolge: absent, double, streak.
 *
 * `tab` grenzt die Prüfung auf eine Zusammenkunft ein (das Planen zeigt Konflikte
 * je Reiter) — inkl. tab-bezogener Serie (Häufung nur in dieser Zusammenkunftsart).
 * Ohne `tab` werden beide Zusammenkünfte geprüft (Wochen-Gesamtzahl fürs Dashboard).
 */
export function weekConflicts(
  weeks: Week[],
  wi: number,
  persons: Person[],
  services: Service[],
  tab?: MeetingKey,
): Conflict[] {
  const week = weeks[wi]
  if (!week) return []
  const conflicts: Conflict[] = []
  const byDisplay = new Map(persons.map((p) => [displayName(p), p]))
  const tabs: MeetingKey[] = tab ? [tab] : ['mid', 'we']

  // absent: in dieser Woche abwesend, aber eingeteilt
  for (const tb of tabs) {
    for (const name of new Set(meetingAssignedNames(week[tb], services))) {
      const person = byDisplay.get(name)
      if (person && person.absent.includes(wi)) {
        conflicts.push({ kind: 'absent', name, tab: tb })
      }
    }
  }

  // helperTask / double: gleiche Person mehrfach in einer Zusammenkunft.
  // helperTask = Hilfsdienst UND Programmpunkt am selben Tag (die vom Nutzer
  // vorgegebene Regel — bei manueller Zuteilung nicht automatisch verhindert);
  // double = mehrere Hilfsdienste am selben Tag. Zwei Programmpunkte (z. B.
  // Vorsitz + Anfangsgebet) sind bewusst KEIN Konflikt.
  for (const tb of tabs) {
    const partCounts = new Map<string, number>()
    for (const name of meetingPartNames(week[tb])) {
      partCounts.set(name, (partCounts.get(name) ?? 0) + 1)
    }
    const helperCounts = new Map<string, number>()
    for (const name of meetingHelperNames(week[tb], services)) {
      helperCounts.set(name, (helperCounts.get(name) ?? 0) + 1)
    }
    for (const name of new Set([...partCounts.keys(), ...helperCounts.keys()])) {
      const pc = partCounts.get(name) ?? 0
      const hc = helperCounts.get(name) ?? 0
      if (pc >= 1 && hc >= 1) conflicts.push({ kind: 'helperTask', name, tab: tb })
      else if (hc >= 2) conflicts.push({ kind: 'double', name, tab: tb, count: hc })
    }
  }

  // streak: Häufung von STREAK_THRESHOLD+ Wochen am Stück. Bewusst nur, wenn
  // der Lauf kürzer als der geladene Zeitraum ist — wer schlicht in *jeder*
  // Woche eingeteilt ist, ist durchgehend aktiv (Auslastungsthema), keine
  // auffällige Serie, und würde sonst nur Rauschen erzeugen. Zählt NUR Aufgaben
  // (Programmpunkte), keine Hilfsdienste — mehrmals in Folge Hilfsdienst ist ok.
  // Mit `tab` zählt nur die jeweilige Zusammenkunftsart, sonst beide.
  const nameSets = weeks.map((w) =>
    tab
      ? new Set(meetingPartNames(w[tab]))
      : new Set([...meetingPartNames(w.mid), ...meetingPartNames(w.we)]),
  )
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
