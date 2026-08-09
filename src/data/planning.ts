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

import { istAbwesend, KEINE_ABWESENHEIT, type AbsenceSet } from './absence'
import { raeume, RATGEBER_ROLLE, ratgeberSlot, slotsOf } from './aux-class'
import { LABEL_EROEFFNUNG, LABEL_WT_STUDIUM } from './constants'
import {
  displayName,
  gehoertZu,
  isPlainPublisher,
  isQualified,
  isSong,
  istAusgefallen,
  LOAD_RADIUS,
  MEETING_TABS,
  partnerGenderOk,
  partWorkload,
  idAufloeser,
  ROLE_GUEST_SPEAKER,
  ROLE_OWN_SPEAKER,
  rolleBasis,
  serviceQualKey,
  tieHash,
  wochenAbstand,
  workloadOf,
  type Zuteilung,
} from './helpers'
import { meetingDateMs, meetingDateText } from './meeting-dates'
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
  SubstituteReq,
  TaskStatus,
  Week,
} from './types'

/**
 * Rollen, die die Auto-Zuteilung nicht besetzt (kommen von außen).
 *
 * Das Vokabular selbst steht in `helpers.ts` — dort, wo `gehoertZu` entscheidet,
 * wem eine Zuteilung gehört, und wo es deshalb gebraucht wird (`helpers.ts` ist
 * die untere Schicht und darf nicht auf `planning.ts` zugreifen). Hier nur der
 * Ausdruck für die Suchläufe und ein Weiterreichen der Begriffe, damit die
 * bestehenden Import-Wege gültig bleiben.
 */
const SKIP_ROLE = /Gastredner|Kreisaufseher/

export {
  isGuestRole,
  isSpeakerRole,
  rolleBasis,
  ROLE_GUEST_SPEAKER,
  ROLE_OWN_SPEAKER,
} from './helpers'



/**
 * Abstand (in Wochen) zur nächstgelegenen Einteilung je Person, gemessen über
 * **alle** geladenen Wochen — einmal nur für Aufgaben (`part`), einmal für
 * Aufgaben und Hilfsdienste (`any`). Wer nirgends vorkommt, fehlt in der Karte
 * und gilt als unendlich weit weg, kommt also zuerst.
 *
 * Warum zusätzlich zum Fenster: die Strichliste zählt nur ±LOAD_RADIUS Wochen. Bei
 * Schulungsaufgaben stehen dort fast alle Schwestern bei null, weil es mehr
 * Schwestern als Plätze gibt — die Zahl unterscheidet dann nichts mehr, und
 * ohne weiteres Kriterium entschiede der Tie-Break-Hash, der zwar streut, aber
 * nicht fragt, wer seit einem halben Jahr wartet. Der Abstand tut genau das.
 *
 * Gemessen wird der Betrag, nicht „davor": Wochen lassen sich in beliebiger
 * Reihenfolge planen. Wer in der Nachbarwoche schon eingeteilt ist, soll auch
 * dann hinten anstehen, wenn diese Woche die frühere ist.
 *
 * `je` misst dasselbe noch einmal **je Bereich** (Bereichsschlüssel des Slots,
 * bei Hilfsdiensten der Bereich des Dienstes). Denn gleich viele Aufgaben heißt
 * noch nicht gleich behandelt: die Strichliste zählt Gesprächsführer und
 * Gesprächspartner beide als eine Aufgabe, und wer im Ranking knapp vorn steht,
 * bekommt jede Woche den Führer-Platz, wer knapp dahinter steht, immer den
 * Partner-Platz. Über ein Jahr gemessen reichte das von „1× geführt / 9×
 * Partnerin" bis „8× / 2×", bei identischer Gesamtzahl. Dasselbe bei Brüdern,
 * die Bibellesung und Leser können.
 */
function assignmentDistance(
  weeks: Week[],
  weekIndex: number,
  wer: (z: Zuteilung | undefined) => string | undefined,
): { part: Map<string, number>; any: Map<string, number>; je: Map<string, Map<string, number>> } {
  const part = new Map<string, number>()
  const any = new Map<string, number>()
  const je = new Map<string, Map<string, number>>()
  const merkenJe = (bereich: string | undefined, id: string | undefined, d: number): void => {
    if (!bereich || !id) return
    let map = je.get(bereich)
    if (!map) { map = new Map(); je.set(bereich, map) }
    if ((map.get(id) ?? Infinity) > d) map.set(id, d)
  }
  weeks.forEach((week, wi) => {
    // In Wochen gemessen, nicht in Einträgen (T36) — sonst zählt eine fehlende
    // Woche als Nachbarwoche.
    const d = wochenAbstand(week, weeks[weekIndex], wi, weekIndex)
    const merken = (map: Map<string, number>, id: string | undefined): void => {
      if (id && (map.get(id) ?? Infinity) > d) map.set(id, d)
    }
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue // entfällt → keine Zuteilung (T30)
      const meeting = week[tab]
      const ratgeber = wer(meeting.auxRatgeber)
      merken(part, ratgeber)
      merken(any, ratgeber)
      merkenJe('ratgeber', ratgeber, d)
      for (const section of meeting.sections) {
        for (const item of section.items) {
          if (isSong(item)) continue
          for (const aux of raeume(meeting)) {
            for (const slot of slotsOf(item, aux)) {
              const id = wer(slot)
              merken(part, id)
              merken(any, id)
              merkenJe(slot.bereichsKey, id, d)
            }
          }
        }
      }
      for (const [key, arr] of Object.entries(meeting.helpers)) {
        for (const slot of arr) {
          const id = wer(slot)
          merken(any, id)
          merkenJe(serviceQualKey(key), id, d)
        }
      }
    }
  })
  return { part, any, je }
}

/** Aktueller Name auf einem Slot ("" = offen). */
export function slotValue(weeks: Week[], sel: MeetingSlotSelection): string {
  const meeting = weeks[sel.wi]?.[sel.tab]
  if (!meeting) return ''
  if (sel.kind === 'ratgeber') return meeting.auxRatgeber?.name ?? ''
  if (sel.kind === 'part') {
    const item = meeting.sections[sel.si]?.items[sel.ii]
    return !item || isSong(item) ? '' : (slotsOf(item, sel.aux === true)[sel.ni]?.name ?? '')
  }
  return meeting.helpers[sel.svc]?.[sel.pos]?.name ?? ''
}

/**
 * Aktuelle Rolle auf einem Slot ("" = keine). Nur Programmpunkte tragen eine;
 * Hilfsdienst-Plätze und der Ratgeber sind über ihren Ort bestimmt.
 *
 * Gebraucht, damit der Reducer beim Zuteilen die **tatsächlich geschriebene**
 * Rolle prüfen kann statt des Auswahl-Flags `sel.guest`. Das war die zweite
 * Hälfte von F1: selbst mit `rolle: 'Redner'` und `pid` unterblieb der
 * Bestätigungs-Flow, weil der Reducer noch auf das Flag sah.
 */
export function slotRolle(weeks: Week[], sel: MeetingSlotSelection): string {
  if (sel.kind !== 'part') return ''
  const item = weeks[sel.wi]?.[sel.tab]?.sections[sel.si]?.items[sel.ii]
  if (!item || isSong(item)) return ''
  return slotsOf(item, sel.aux === true)[sel.ni]?.rolle ?? ''
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
  person: Person,
  services: Service[],
  exclude?: SlotSelection,
): MeetingAssignment[] {
  const out: MeetingAssignment[] = []
  meeting.sections.forEach((section, si) => {
    section.items.forEach((item, ii) => {
      if (isSong(item)) return
      // Über beide Räume, wie countOpenSlots und clearAssignments: die Plätze
      // der Zusätzlichen Klasse sind gleichwertige Zuteilungen. Ohne sie blieb
      // der Hinweis „heute schon zugeteilt" aus, das Dashboard zeigte „frei"
      // für jemanden, der in der Klasse eingeteilt war, und takeSubstitute
      // übersah den Konflikt.
      for (const aux of raeume(meeting)) {
        slotsOf(item, aux).forEach((slot, ni) => {
          if (!gehoertZu(slot, person)) return
          if (
            exclude?.kind === 'part' &&
            exclude.si === si &&
            exclude.ii === ii &&
            exclude.ni === ni &&
            (exclude.aux === true) === aux
          ) {
            return
          }
          const rolle = slot.rolle ?? ''
          // Rolle bevorzugen (Vorsitz/Gebet/Leiter/Leser …); Begleiter-Label
          // ("mit …") ignorieren und stattdessen den Programmpunkt-Titel zeigen.
          if (rolle && !rolle.startsWith('mit')) out.push({ text: rolle, lang: 'u' })
          else out.push({ text: item.title, lang: 'p' })
        })
      }
    })
  })
  // Ratgeber der Zusätzlichen Klasse — eine Zuteilung je Zusammenkunft.
  if (gehoertZu(meeting.auxRatgeber, person)) out.push({ text: RATGEBER_ROLLE, lang: 'u' })
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    arr.forEach((slot, pos) => {
      if (!gehoertZu(slot, person)) return
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
  // Zeigt die Auswahl ins Leere — die Woche ist aus dem geladenen Fenster
  // gerutscht, der Punkt wurde nebenher gelöscht —, bleibt alles, wie es war.
  // Vorher warf der Zugriff, und das mitten im Reducer (T42).
  const meeting = next[sel.wi]?.[sel.tab]
  if (!meeting) return weeks
  if (sel.kind === 'ratgeber') {
    meeting.auxRatgeber = { ...ratgeberSlot(meeting), name }
    if (name && pid) meeting.auxRatgeber.pid = pid
    else delete meeting.auxRatgeber.pid
  } else if (sel.kind === 'part') {
    const item = meeting.sections[sel.si]?.items[sel.ii]
    // Kein Punkt, ein Lied oder kein solcher Platz: nichts zu setzen. Dann die
    // **Eingabe** zurückgeben, nicht den unveränderten Klon — Reducer und
    // persist.ts entscheiden über die Identität, ob gespeichert werden muss.
    // Ein gleicher, aber neuer Klon löste ein Schreiben ohne Änderung aus.
    if (!item || isSong(item)) return weeks
    const slot = slotsOf(item, sel.aux === true)[sel.ni]
    if (!slot) return weeks
    slot.name = name
    // Person-Id als stabile Identität mitführen; beim Entfernen bzw. bei
    // externen Rednern (kein pid) das Feld sauber löschen.
    if (name && pid) slot.pid = pid
    else delete slot.pid
    // Gastredner-Slots: Rolle trägt die Herkunfts-Versammlung mit
    // ("Gastredner · Vers. Nordheim")
    if (rolle !== undefined) slot.rolle = rolle
  } else {
    const arr = meeting.helpers[sel.svc] ?? []
    while (arr.length <= sel.pos) arr.push({ name: '' })
    arr[sel.pos] = name && pid ? { name, pid } : { name }
    meeting.helpers[sel.svc] = arr
  }
  return next
}

/**
 * Offene Zuteilungen in einer Ansicht (Programmpunkte + Hilfsdienst-Plätze).
 * Die Plätze der Zusätzlichen Klasse zählen mit — sie sind ebenso zu besetzen;
 * ohne sie meldete der Planen-Kopf „alles zugeteilt", während die halbe Klasse
 * noch offen wäre. Ist keine eingerichtet, gibt es sie schlicht nicht.
 */
export function countOpenSlots(meeting: Meeting, services: Service[]): number {
  let count = 0
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const aux of raeume(meeting)) {
        for (const slot of slotsOf(item, aux)) if (!slot.name) count++
      }
    }
  }
  if (meeting.auxRatgeber && !meeting.auxRatgeber.name) count++
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
  woche: string,
  tab: MeetingKey,
): string[] {
  const keys: string[] = []
  next.sections.forEach((section, si) => {
    section.items.forEach((item, ii) => {
      if (isSong(item)) return
      const prevItem = prev.sections[si]?.items[ii]
      for (const aux of raeume(next)) {
        const vorher = prevItem && !isSong(prevItem) ? slotsOf(prevItem, aux) : []
        slotsOf(item, aux).forEach((slot, ni) => {
          if ((vorher[ni]?.name ?? '') !== slot.name) keys.push(slotTaskKey(item, woche, tab, si, ii, ni, aux))
        })
      }
    })
  })
  for (const svc of services) {
    const prevArr = prev.helpers[svc.key] ?? []
    const nextArr = next.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if ((prevArr[pos]?.name ?? '') !== (nextArr[pos]?.name ?? ''))
        keys.push(helperTaskKey(woche, tab, svc.key, pos))
    }
  }
  if ((prev.auxRatgeber?.name ?? '') !== (next.auxRatgeber?.name ?? '')) {
    keys.push(ratgeberTaskKey(woche, tab))
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
      // Beide Räume und der Ratgeber, genau wie countOpenSlots zählt. Vorher
      // nannte der Planen-Kopf eine höhere Zahl, als das Banner darunter
      // auflistete.
      for (const aux of raeume(meeting)) {
        for (const slot of slotsOf(item, aux)) {
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
  }
  if (meeting.auxRatgeber && !meeting.auxRatgeber.name) {
    out.push({ text: RATGEBER_ROLLE, lang: 'u', n: 1 })
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
  newly: string[] // neu vergebene Personennamen (Mitteilungstexte, Tests)
  newlyIds: string[] // dieselben als Person-Id (→ pendingIds)
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
 *    eines gleitenden Fensters (±LOAD_RADIUS Wochen um die geplante Woche):
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
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
): AutoAssignResult {
  const next = structuredClone(weeks)
  // Entfällt die Zusammenkunft, gibt es nichts zu besetzen (T30). Ohne diese
  // Zeile verteilte „Automatisch zuteilen" Aufgaben für einen Abend, an dem
  // niemand zusammenkommt — und benachteiligte die Gewählten anschließend bei
  // der nächsten echten Zusammenkunft, weil sie als ausgelastet gälten.
  const meeting = next[weekIndex]?.[tab]
  if (!meeting || istAusgefallen(next[weekIndex], tab)) {
    return { weeks, count: 0, newly: [], newlyIds: [], unfilled: 0 }
  }

  // Reinigungs-Regel: Aufseher und Gehilfe der Gruppe, die in dieser Woche
  // reinigt, sollen möglichst keinen weiteren Hilfsdienst bekommen (sie sind mit
  // der Reinigung beschäftigt). Umgesetzt als weicher Malus bei der
  // Hilfsdienst-Auswahl — greift nur, solange genug andere Kandidaten da sind.
  const cleaningGroup = groups.length ? groups[weekIndex % groups.length] : null
  const cleaningLeaders = new Set<string>()
  for (const pid of [cleaningGroup?.ov, cleaningGroup?.as]) {
    if (pid && persons.some((p) => p.id === pid)) cleaningLeaders.add(pid)
  }
  const HELPER_MALUS = 1e6

  // Auflöser Zuteilung → Person-Id; alle Mengen und Strichlisten unten sind
  // nach Id geführt, nicht nach Name (siehe idAufloeser).
  const werIst = idAufloeser(persons)

  // Wer in dieser Zusammenkunft schon eingeteilt ist. Nach Id: zwei Personen
  // desselben Namens sperrten sich sonst gegenseitig, obwohl nur eine dran ist.
  const used = new Set<string>()
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        const id = werIst(slot)
        if (id) used.add(id)
      }
    }
  }
  for (const arr of Object.values(meeting.helpers)) {
    for (const slot of arr) {
      const id = werIst(slot)
      if (id) used.add(id)
    }
  }

  // Gleitendes Fenster: nur ±LOAD_RADIUS Wochen um die geplante Woche zählen,
  // damit uralte Einteilungen die aktuelle Verteilung nicht verzerren. Dasselbe
  // Fenster, das im Zuteilungs-Sheet unter dem Namen steht („2 Aufgaben in 5
  // Wochen") — sonst sortiert die Automatik nach einer anderen Zahl, als der
  // Planer liest.
  const lo = Math.max(0, weekIndex - LOAD_RADIUS)
  const hi = Math.min(weeks.length - 1, weekIndex + LOAD_RADIUS)
  const windowWeeks = weeks.slice(lo, hi + 1)

  // Zwei Live-Strichlisten (Startwert aus dem Fenster, während des Laufs
  // hochgezählt): partLoad = nur Aufgaben, totalLoad = Aufgaben + Hilfsdienste.
  const partLoad = new Map<string, number>()
  const totalLoad = new Map<string, number>()
  const pl = (p: Person): number => partLoad.get(p.id) ?? partWorkload(windowWeeks, p)
  const tl = (p: Person): number => totalLoad.get(p.id) ?? workloadOf(windowWeeks, p, services)

  // Abstand zur nächstgelegenen Einteilung über ALLE geladenen Wochen — der
  // Tie-Break, sobald im Fenster mehrere bei null stehen (der Normalfall bei
  // Schulungsaufgaben: mehr Schwestern als Plätze). Ohne ihn entschiede dort
  // der Zufallshash und niemand fragt, wer am längsten wartet.
  const { part: partDist, any: anyDist, je: bereichDist } = assignmentDistance(weeks, weekIndex, werIst)

  let count = 0
  let unfilled = 0
  const newly: string[] = []
  /** Dieselben Zuteilungen als Person-Id — für die „…"-Markierung (pendingIds). */
  const newlyIds: string[] = []

  // Umfang: Programmpunkte (Aufgaben) und/oder Hilfsdienste getrennt zuteilbar.
  const doParts = scope !== 'helpers'
  const doHelpers = scope !== 'parts'

  const claim = (kind: 'part' | 'helper', person: Person): void => {
    used.add(person.id)
    totalLoad.set(person.id, tl(person) + 1)
    if (kind === 'part') partLoad.set(person.id, pl(person) + 1)
    newly.push(displayName(person))
    newlyIds.push(person.id)
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
    const byTotal = opts.byTotal || kind === 'helper'
    const load = byTotal ? tl : pl
    const dist = (p: Person): number => (byTotal ? anyDist : partDist).get(p.id) ?? Infinity
    const distB = (p: Person): number =>
      (priv ? bereichDist.get(priv)?.get(p.id) : undefined) ?? Infinity
    // Malus (letzte Wahl): Reinigungs-Aufseher bei Hilfsdiensten; zusätzlich der
    // per opts.malus markierte Kreis (z. B. Älteste/DAG bei Gesprächsteilen).
    const eff = (p: Person): number => {
      let e = load(p)
      if (kind === 'helper' && cleaningLeaders.has(p.id)) e += HELPER_MALUS
      if (opts.malus?.(p)) e += HELPER_MALUS
      return e
    }
    const candidates = persons.filter(
      (p) =>
        (!priv || isQualified(p, priv)) &&
        !istAbwesend(abwesend, p.id, weekIndex, tab) &&
        (!opts.extra || opts.extra(p)) &&
        !used.has(p.id),
    )
    if (candidates.length === 0) return null
    candidates.sort(
      (a, b) =>
        eff(a) - eff(b) ||
        // Gleiche Last → wer am längsten nicht dran war, kommt zuerst.
        dist(b) - dist(a) ||
        // Danach erst der Bereich — nie davor: sonst rotiert jeder Bereich für
        // sich und dieselbe Person landet drei Wochen in Folge in dreien.
        distB(b) - distB(a) ||
        // Der Tie-Break-Schlüssel bleibt der Name: er soll sich lesbar aus der
        // Person ergeben und nicht aus einer zufälligen UUID, die bei jeder
        // Neuanlage eine andere Reihenfolge ergäbe.
        tieHash(`${displayName(a)}|${weekIndex}|${tab}`) -
          tieHash(`${displayName(b)}|${weekIndex}|${tab}`),
    )
    return candidates[0] ?? null
  }

  /**
   * Auswahl-Optionen für einen Schülerteil-Slot (gold): Vortrag → männlich;
   * Gesprächsführer/-partner → Gesamtlast (Schwestern zuerst), Älteste/DAG nur
   * als letzte Wahl (Malus); Partner zusätzlich gleiches Geschlecht wie der Führer.
   */
  const ministryOpts = (item: PartItem, slot: SlotAssignment, aux = false) => {
    if (slot.male) return { extra: (p: Person) => !p.female }
    if (slot.bereichsKey === 'schulung') {
      return { byTotal: true, malus: (p: Person) => !isPlainPublisher(p) }
    }
    if (slot.bereichsKey === 'schulungPartner') {
      // Der Gesprächspartner muss zum Führer DESSELBEN Raums passen — sonst
      // richtete sich die Zusätzliche Klasse nach dem Hauptsaal.
      const leadName = slotsOf(item, aux).find((n) => n.bereichsKey === 'schulung')?.name ?? ''
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
        (p) =>
          p.priv[flag] &&
          !istAbwesend(abwesend, p.id, weekIndex, tab) &&
          !used.has(p.id),
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
            claim('part', person)
          } else {
            unfilled++
          }
        }
      }
    }
  }

  // 2) Übrige Programmpunkte. Das Anfangsgebet (Eröffnung) wird übersprungen
  //    und unten an den Vorsitz gekoppelt.
  //
  //    Die Zusätzliche Klasse läuft in derselben Schleife mit: ihre Plätze
  //    sind gleichwertige Aufgaben und teilen sich die `used`-Menge mit dem
  //    Hauptsaal — niemand kann zur selben Zeit in beiden Räumen sein.
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const aux of raeume(meeting)) {
        for (const slot of slotsOf(item, aux)) {
          if (slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue
          if (section.label === LABEL_EROEFFNUNG && slot.rolle === 'Gebet') continue
          // Schülerteile (gold): Geschlecht/Partner/Verteilung berücksichtigen.
          const person = pick('part', slot.bereichsKey, ministryOpts(item, slot, aux))
          if (person) {
            slot.name = displayName(person)
            slot.pid = person.id
            claim('part', person)
          } else {
            unfilled++
          }
        }
      }
    }
  }

  // 2b) Ratgeber der Zusätzlichen Klasse — eigener Bereich, eine Person je
  //     Zusammenkunft. Nur besetzen, wenn die Woche überhaupt eine Klasse hat.
  if (meeting.auxRatgeber && !meeting.auxRatgeber.name) {
    const person = pick('part', 'ratgeber')
    if (person) {
      meeting.auxRatgeber.name = displayName(person)
      meeting.auxRatgeber.pid = person.id
      claim('part', person)
    } else {
      unfilled++
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
      // Die Strichliste nur führen, wenn die Person auflösbar ist: bei einem
      // externen Vorsitz (kein Eintrag in `persons`) gibt es keine Auslastung
      // zu erhöhen — vorher landete dort der blanke Name als eigener Schlüssel.
      const vorsitzPerson = persons.find((p) => p.id === werIst(vorsitzSlot))
      if (vorsitzPerson) {
        totalLoad.set(vorsitzPerson.id, tl(vorsitzPerson) + 1)
        partLoad.set(vorsitzPerson.id, pl(vorsitzPerson) + 1)
      }
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
          claim('helper', person)
        } else {
          unfilled++
        }
      }
    }
    meeting.helpers[svc.key] = arr
  }
  } // Ende Hilfsdienste (doHelpers)

  return { weeks: next, count, newly, newlyIds, unfilled }
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
  const meeting = next[weekIndex]?.[tab]
  if (!meeting) return { weeks, count: 0 }
  let count = 0
  if (scope === 'parts') {
    for (const section of meeting.sections) {
      for (const item of section.items) {
        if (isSong(item)) continue
        // Beide Räume leeren: „Leeren" meint die Aufgaben dieser Ansicht,
        // und die Zusätzliche Klasse gehört dazu.
        for (const aux of raeume(meeting)) {
          for (const slot of slotsOf(item, aux)) {
            if (SKIP_ROLE.test(slot.rolle ?? '')) continue // externer Redner bleibt
            if (slot.name) {
              slot.name = ''
              delete slot.pid
              // Ein geleerter Redner-Platz fällt auf „Gastredner" zurück — den
              // Ausgangszustand aus dem Import. Bliebe er auf „Redner" stehen,
              // wäre er ein offener Slot, den die Auto-Zuteilung besetzt; den
              // Redner des öffentlichen Vortrags vereinbart man aber, man
              // verlost ihn nicht. Derselbe Rückfall wie beim „Entfernen".
              if (rolleBasis(slot.rolle) === ROLE_OWN_SPEAKER) slot.rolle = ROLE_GUEST_SPEAKER
              count++
            }
          }
        }
      }
    }
    if (meeting.auxRatgeber?.name) {
      meeting.auxRatgeber = { ...meeting.auxRatgeber, name: '' }
      delete meeting.auxRatgeber.pid
      count++
    }
  } else {
    for (const key of Object.keys(meeting.helpers)) {
      const arr = meeting.helpers[key] ?? []
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]?.name) {
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
export function buildS89ForSlot(
  weeks: Week[],
  sel: MeetingSlotSelection,
  meetings = '',
): S89Payload | null {
  if (sel.kind !== 'part') return null
  const week = weeks[sel.wi]
  const item = week?.[sel.tab].sections[sel.si]?.items[sel.ii]
  if (!week || !item || isSong(item)) return null
  const raum = sel.aux === true
  const slot = slotsOf(item, raum)[sel.ni]
  const current = slot?.name ?? ''
  if (!current) return null
  const isStudent =
    sel.priv === 'schulung' || sel.priv === 'schulungPartner' || item.title.startsWith('Bibellesung')
  if (!isStudent) return null
  // Hauptteilnehmer (schulung) und Gesprächspartner (schulungPartner) stehen als
  // getrennte Slots im selben Punkt. Alt-Daten trugen den Partner als "mit X" im
  // Rollentext — als Rückfall weiter unterstützt.
  const leadName = slotsOf(item, raum).find((n) => n.bereichsKey === 'schulung')?.name ?? ''
  const partnerName = slotsOf(item, raum).find((n) => n.bereichsKey === 'schulungPartner')?.name ?? ''
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
    date: meetingDateText(week, sel.wi, sel.tab, meetings),
    type: item.title + (setting ? ` · ${setting}` : ''),
    point,
    // Der Ort stand hier frueher gar nicht im Modell — das Formular zeigte
    // immer 'Hauptsaal'. Jetzt kommt er aus der tatsaechlichen Zuteilung.
    aux: raum,
  }
}

/* ---- Aufgaben-Ableitung (Produktionsmodus) -------------------------------
 * Im Demo-Modus sind "Meine Aufgaben" feste Demo-Daten; mit Persistenz werden
 * sie aus den Wochen-Zuteilungen berechnet. Der Bestätigungs-Status hängt am
 * stabilen Slot-Pfad (taskKey) — verschieben Planer Programmpunkte, wandert
 * der Status bewusst nicht mit (v1-Kompromiss, Status gilt dann als offen).
 */

const TABS: MeetingKey[] = ['mid', 'we']

/**
 * Ist das vorderste Feld eines `task_key` eine Wochen-Kennung (T66)?
 *
 * Seit T66 steht dort das **Startdatum** der Woche („2026-09-07"), vorher ihre
 * **Position** („60"). Beide sind auf einen Blick unterscheidbar, und genau das
 * braucht die Lade-Migration: Sie erkennt daran, was sie schon umgestellt hat.
 *
 * Geprüft wird nur die Form, nicht die Gültigkeit des Datums — ein „2026-13-45"
 * käme aus keiner Quelle, die wir schreiben, und ein zu strenger Test hier
 * verwürfe im Zweifel echte Schlüssel.
 */
export function istWochenKennung(feld: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(feld)
}

/**
 * Index der Woche mit dieser Kennung — `-1`, wenn sie nicht geladen ist.
 *
 * Das Gegenstück zum Umbau: Wer aus einem Schlüssel wieder eine Woche braucht,
 * schlägt sie hier nach, statt die Zahl als Index zu missbrauchen. Nicht
 * geladen heißt nicht ungültig — die Woche kann außerhalb des Ladefensters
 * liegen (WEEK_LIMIT), und ihr Schlüssel bleibt trotzdem richtig.
 */
export function wochenIndex(weeks: readonly Week[], woche: string): number {
  return woche ? weeks.findIndex((w) => w.start === woche) : -1
}

/**
 * Stabiler Schlüssel eines Programmpunkt-Slots (auch confirmations.task_key).
 *
 * Der Abschnitt „part" wird für die Zusätzliche Klasse zu „aux" — bewusst an
 * derselben Stelle statt als Anhang: der Schlüssel eines Hauptsaal-Platzes
 * bleibt dadurch Zeichen für Zeichen derselbe wie bisher, alle bestehenden
 * Bestätigungen behalten ihre Gültigkeit.
 */
export function partTaskKey(
  woche: string,
  tab: MeetingKey,
  si: number,
  ii: number,
  ni: number,
  aux = false,
): string {
  return `${woche}|${tab}|${aux ? 'aux' : 'part'}|${si}|${ii}|${ni}`
}

/**
 * Schlüssel eines Programmpunkt-Slots über die **stabile Kennung** des Punkts
 * (T37) — `"60|mid|part|k3f9x|0"` statt `"60|mid|part|2|1|0"`.
 *
 * Der Unterschied ist der Abschnitt und die laufende Nummer: sie sind weg. Eine
 * Bestätigung folgt damit dem Punkt, nicht seinem Platz in der Liste. Genau
 * daran scheiterte T16 — ein eingefügter LAC-Punkt verschob alle folgenden, und
 * die Bestätigungen blieben an der alten Zahl kleben.
 *
 * **Beide Formen sind an ihrer Länge unterscheidbar**: fünf Felder hier, sechs
 * beim alten positionsbasierten Schlüssel. Das braucht die Lade-Migration, um
 * zu erkennen, was sie schon umgestellt hat.
 */
export function itemTaskKey(
  woche: string,
  tab: MeetingKey,
  iid: string,
  ni: number,
  aux = false,
): string {
  return `${woche}|${tab}|${aux ? 'aux' : 'part'}|${iid}|${ni}`
}

/**
 * Schlüssel eines Programmpunkt-Slots — die **eine** Stelle, an der zwischen
 * stabiler Kennung und altem Positions-Schlüssel entschieden wird.
 *
 * Alles andere ruft nur noch hier an. Solange eine Woche noch keine Kennungen
 * trägt (Demo-Daten, Vorlagen, noch nicht migrierte Datensätze), gilt weiterhin
 * die Position — dieselben Schlüssel wie bisher, also bleiben bestehende
 * Bestätigungen gültig.
 */
export function slotTaskKey(
  item: PartItem,
  woche: string,
  tab: MeetingKey,
  si: number,
  ii: number,
  ni: number,
  aux = false,
): string {
  return item.iid
    ? itemTaskKey(woche, tab, item.iid, ni, aux)
    : partTaskKey(woche, tab, si, ii, ni, aux)
}


/** Stabiler Schlüssel des Ratgebers einer Zusammenkunft. */
export function ratgeberTaskKey(woche: string, tab: MeetingKey): string {
  return `${woche}|${tab}|ratgeber`
}

/** Stabiler Schlüssel eines Hilfsdienst-Slots. */
export function helperTaskKey(woche: string, tab: MeetingKey, svc: string, pos: number): string {
  return `${woche}|${tab}|helper|${svc}|${pos}`
}

/**
 * Woche und Zusammenkunft eines task_key — jeder beginnt mit `<wi>|<tab>|…`,
 * gleich ob Programmpunkt, Ratgeber oder Hilfsdienst. null bei Fremdformaten.
 */
export function taskKeyWeek(key: string): { woche: string; tab: MeetingKey } | null {
  const [woche, tab] = key.split('|')
  if (!woche || !istWochenKennung(woche)) return null
  return tab === 'mid' || tab === 'we' ? { woche, tab } : null
}

/** Zerlegt einen Hilfsdienst-task_key; null, wenn es kein Hilfsdienst-Key ist. */
export function helperKeyParts(
  key: string,
): { woche: string; tab: MeetingKey; svc: string; pos: number } | null {
  const p = key.split('|')
  if (p.length !== 5 || p[2] !== 'helper') return null
  return { woche: p[0] ?? '', tab: p[1] as MeetingKey, svc: p[3] ?? '', pos: Number(p[4]) }
}

/**
 * Offene Ersatzgesuche für `me`: Hilfsdienst-Slots, deren Bearbeiter „verhindert"
 * gemeldet hat und für die `me` qualifiziert (gleicher Dienst), nicht selbst der
 * Absager und in der Woche nicht abwesend ist. Nächste zuerst.
 */
export function deriveSubstituteReqs(
  weeks: Week[],
  services: Service[],
  confirmations: ConfirmationMap,
  me: Person,
  meetings = '',
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
): SubstituteReq[] {
  const out: SubstituteReq[] = []
  const myName = displayName(me)
  const svcByKey = new Map(services.map((s) => [s.key, s]))
  for (const [key, status] of Object.entries(confirmations)) {
    if (status !== 'verhindert') continue
    const parts = helperKeyParts(key)
    if (!parts) continue
    const svc = svcByKey.get(parts.svc)
    if (!svc || svc.groups) continue
    if (!isQualified(me, serviceQualKey(parts.svc))) continue
    const wi = wochenIndex(weeks, parts.woche)
    if (wi < 0) continue // Woche nicht geladen — dazu ist nichts zu sagen
    if (istAbwesend(abwesend, me.id, wi, parts.tab)) continue
    const week = weeks[wi]
    const meeting = week?.[parts.tab]
    const slot = meeting?.helpers[parts.svc]?.[parts.pos]
    if (!meeting || !slot?.name || slot.name === myName) continue // eigener/leerer Slot
    out.push({
      key,
      svc: parts.svc,
      title: svc.name,
      date: taskDate(week, wi, parts.tab, meetings),
      at: meetingDateMs(week, parts.tab, meetings),
      declinedBy: slot.name,
    })
  }
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
}

/**
 * task_key-Paare zweier getauschter Programmpunkt-Positionen (LAC verschieben).
 * Für ni = 0..count-1 wird `part|si|a|ni` mit `part|si|b|ni` vertauscht — so
 * folgt die Bestätigung dem Programmpunkt statt der Position.
 */
export function partSwapKeyPairs(
  woche: string,
  tab: MeetingKey,
  si: number,
  a: number,
  b: number,
  count: number,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let ni = 0; ni < count; ni++) {
    pairs.push([partTaskKey(woche, tab, si, a, ni), partTaskKey(woche, tab, si, b, ni)])
  }
  return pairs
}

/**
 * Bestätigungen an eine eingefügte oder gelöschte Programmpunkt-Position
 * anpassen.
 *
 * **Betrifft seit T37 nur noch Wochen ohne stabile Kennungen** — Demo-Daten,
 * Vorlagen und Datensätze, die die Lade-Migration noch nicht erreicht hat.
 * Trägt ein Punkt eine `iid`, steht sie im Schlüssel statt seiner Position, und
 * es gibt schlicht nichts zu verschieben; diese Funktion findet dann keinen
 * passenden Schlüssel und tut nichts. Sie bleibt trotzdem stehen: solange es
 * Wochen der alten Form gibt, ist sie richtig, und ein leerer Lauf kostet nichts.
 *
 * Der alte `task_key` ist positionsbasiert (`wi|tab|part|si|ii|ni`). Beim
 * Verschieben eines LAC-Punkts tauscht `swapPartConfirmations` die Status
 * korrekt mit — beim **Löschen** und **Hinzufügen** rutschen aber alle
 * folgenden Punkte um eine Position, und die Bestätigungen blieben an der alten
 * Zahl kleben. Nach dem Löschen erbte der nachfolgende Punkt deshalb die fremde
 * Bestätigung, während der eigentliche wieder als offen galt — und erneut
 * erinnert wurde.
 *
 * `delta` = −1 beim Löschen von `ab`, +1 beim Einfügen an `ab`.
 *
 * Liefert neben der neuen Map die Umbenennungen für die Datenbank. Die
 * Reihenfolge ist bindend: beim Löschen von vorn nach hinten, beim Einfügen
 * von hinten nach vorn — sonst kollidiert eine Umbenennung mit einem noch
 * belegten Schlüssel.
 */
export function shiftPartConfirmations(
  map: ConfirmationMap,
  woche: string,
  tab: MeetingKey,
  si: number,
  ab: number,
  delta: -1 | 1,
): { map: ConfirmationMap; renames: Array<[string, string]>; removed: string[] } {
  const praefix = `${woche}|${tab}|`
  const betroffen: Array<{ key: string; art: string; ii: number; ni: string; status: TaskStatus }> =
    []
  // Über die Einträge, nicht über die Schlüssel: der Status kommt so aus
  // derselben Iteration mit, statt ihn unten am Index nachzuschlagen. Der
  // Nachschlag dort war sicher (der Schlüssel stammt aus der Map), aber nur
  // durch ein Argument — hier trägt ihn die Struktur (T42).
  for (const [key, status] of Object.entries(map ?? {})) {
    if (!key.startsWith(praefix)) continue
    const teile = key.split('|')
    if (teile.length !== 6) continue
    const [, , art, sStr, iStr, ni] = teile
    if ((art !== 'part' && art !== 'aux') || Number(sStr) !== si) continue
    const ii = Number(iStr)
    if (ii < ab) continue
    betroffen.push({ key, art, ii, ni: ni ?? '', status })
  }
  if (betroffen.length === 0) return { map, renames: [], removed: [] }

  // Löschen: von vorn nach hinten (die gelöschte Position ist frei).
  // Einfügen: von hinten nach vorn (die höchste Position ist frei).
  betroffen.sort((a, b) => (delta === -1 ? a.ii - b.ii : b.ii - a.ii))

  const next = { ...map }
  const renames: Array<[string, string]> = []
  const removed: string[] = []
  for (const eintrag of betroffen) {
    if (delta === -1 && eintrag.ii === ab) {
      delete next[eintrag.key]
      removed.push(eintrag.key)
      continue
    }
    const neu = `${praefix}${eintrag.art}|${si}|${eintrag.ii + delta}|${eintrag.ni}`
    delete next[eintrag.key]
    // Ohne Bedingung übernommen, damit Client und Datenbank dieselbe Menge an
    // Schlüsseln behalten: `renames` geht so oder so an die Datenbank. Würde
    // hier ein Status wegen Falsy-Prüfung wegfallen, benannte die Datenbank um,
    // was der Client vergessen hat — und die Bestätigung wäre nur noch in
    // einer der beiden Hälften vorhanden. `TaskStatus` kennt heute keinen
    // falsy Wert; die Kopplung soll aber auch dann halten, wenn einer dazukommt.
    next[neu] = eintrag.status
    renames.push([eintrag.key, neu])
  }
  return { map: next, renames, removed }
}

/** Bestätigungs-Status zweier getauschter Positionen in der Map vertauschen. */
export function swapPartConfirmations(
  map: ConfirmationMap,
  woche: string,
  tab: MeetingKey,
  si: number,
  a: number,
  b: number,
  count: number,
): ConfirmationMap {
  const next = { ...map }
  let changed = false
  for (const [ka, kb] of partSwapKeyPairs(woche, tab, si, a, b, count)) {
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

/**
 * Termin einer Aufgabe. Geht über meetingDateText, damit importierte Wochen
 * nicht ihre Wochenspanne ("7.–13. September") als Termin ausgeben.
 */
function taskDate(week: Week, wi: number, tab: MeetingKey, meetings: string): string {
  return meetingDateText(week, wi, tab, meetings)
}

/** Besucht alle belegten Slots (Programmpunkte + Hilfsdienste) aller Wochen. */
function eachAssignedSlot(
  weeks: Week[],
  services: Service[],
  meetings: string,
  visit: (name: string, key: string, task: () => MyTask, pid?: string) => void,
): void {
  weeks.forEach((week, wi) => {
    for (const tab of TABS) {
      // Entfällt die Zusammenkunft, gibt es dazu nichts zu bestätigen, zu
      // erinnern oder zu vertreten (T30). Die Zuteilungen bleiben in den Daten
      // stehen — sie sind nicht verwaist, sie ruhen nur, solange nichts
      // stattfindet.
      if (istAusgefallen(week, tab)) continue
      const meeting = week[tab]
      // Echtes Datum der Zusammenkunft (nur bei importierten Wochen) → Countdown.
      const at = meetingDateMs(week, tab, meetings)
      meeting.sections.forEach((section, si) => {
        section.items.forEach((item, ii) => {
          if (isSong(item)) return
          // Hauptsaal und Zusätzliche Klasse laufen durch dieselbe Schleife —
          // die Plätze der Klasse sind gleichwertige Aufgaben (bestätigen,
          // erinnern, S-89), nur mit eigenem Schlüssel und eigenem Ort.
          for (const aux of raeume(meeting)) {
            slotsOf(item, aux).forEach((slot, ni) => {
              // Gastredner/Kreisaufseher kommen von außen — kein Bestätigungs-Flow
              if (!slot.name || SKIP_ROLE.test(slot.rolle ?? '')) return
              const key = slotTaskKey(item, week.start, tab, si, ii, ni, aux)
              visit(slot.name, key, () => {
                const rolle = slot.rolle ?? ''
                const sel: SlotSelection = {
                  kind: 'part', wi, tab, si, ii, ni, aux: aux || undefined,
                  label: '', priv: slot.bereichsKey ?? null, groups: false,
                }
                return {
                  id: key,
                  title: rolle && !rolle.startsWith('mit ') ? `${item.title} · ${rolle}` : item.title,
                  date: taskDate(week, wi, tab, meetings),
                  chip: '',
                  at,
                  status: 'offen',
                  s89: buildS89ForSlot(weeks, sel, meetings),
                }
              }, slot.pid)
            })
          }
        })
      })
      // Ratgeber der Zusätzlichen Klasse: eine Aufgabe je Zusammenkunft.
      const ratgeber = meeting.auxRatgeber
      if (ratgeber?.name) {
        const key = ratgeberTaskKey(week.start, tab)
        visit(ratgeber.name, key, () => ({
          id: key,
          title: RATGEBER_ROLLE,
          date: taskDate(week, wi, tab, meetings),
          chip: '',
          at,
          status: 'offen',
          s89: null,
        }), ratgeber.pid)
      }
      for (const svc of services) {
        if (svc.groups) continue // Gruppen-Rotation hat keine persönliche Aufgabe
        const arr = meeting.helpers[svc.key] ?? []
        for (let pos = 0; pos < svc.count; pos++) {
          const slot = arr[pos]
          if (!slot?.name) continue
          const key = helperTaskKey(week.start, tab, svc.key, pos)
          visit(slot.name, key, () => ({
            id: key,
            title: svc.name,
            date: taskDate(week, wi, tab, meetings),
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
export function derivePendingIds(
  weeks: Week[],
  services: Service[],
  confirmations: ConfirmationMap,
): string[] {
  const pending = new Set<string>()
  // meetings ist für die reine Mengenbildung irrelevant (kein Countdown nötig).
  eachAssignedSlot(weeks, services, '', (name, key, _task, pid) => {
    if (confirmations[key] !== 'bestätigt') pending.add(kennungVon(name, pid))
  })
  return [...pending]
}

/**
 * Kennung einer Zuteilung für die „…"-Markierung im Planen.
 *
 * Die Person-Id, wo vorhanden — sonst der Anzeigename mit Präfix, damit ein
 * Name nie versehentlich wie eine Id aussieht. Vorher war das eine reine
 * Namensliste: zwei Personen desselben Namens bekamen gemeinsam das „…", auch
 * wenn nur eine von beiden noch nicht bestätigt hatte. Und weil Namen sich
 * ändern, musste die Liste beim Umbenennen mitgepflegt werden — mit Ids
 * entfällt das.
 */
export function kennungVon(name: string, pid?: string): string {
  return pid ?? `name:${name}`
}

/* ---- Konfliktprüfungen (Planen) ------------------------------------------
 * Warnungen für den Planer, aus den Wochen abgeleitet: jemand ist trotz
 * Abwesenheit eingeteilt, mehrfach in derselben Zusammenkunft, oder über
 * mehrere Wochen am Stück eingeteilt. Reine Ableitung, keine Persistenz.
 */

/** Ab wie vielen Wochen in Folge ein „streak“-Konflikt entsteht. */
const STREAK_THRESHOLD = 3

export type ConflictKind = 'absent' | 'double' | 'helperTask' | 'streak' | 'fsAbsent' | 'fsDouble'

export interface Conflict {
  kind: ConflictKind
  name: string // Anzeigename der Person
  tab?: MeetingKey // betroffene Zusammenkunft (absent/double/helperTask)
  count?: number // double: Hilfsdienste in der Zusammenkunft; streak: Wochen in Folge
  // Treffpunkte haben keine Zusammenkunft, sondern einen eigenen Wochentag und
  // Ort — beides gehört in den Hinweis, sonst weiß der Planer nicht, welchen
  // der Treffpunkte dieser Woche er ansehen soll.
  wd?: number // fsAbsent/fsDouble: Wochentag (0=So … 6=Sa)
  ort?: string // fsAbsent: Ort des Treffpunkts
}

/**
 * Belegte Personen-Namen einer Zusammenkunft (mit Duplikaten). Ohne Lieder,
 * ohne externe Slots (Gastredner/Kreisaufseher) und ohne Gruppen-Rotation —
 * die sind keine zuteilbaren Personen.
 */
/** Belegte Namen der Programmpunkte (ohne Lieder, ohne externe Slots). */
function meetingPartNames(meeting: Meeting, wer: IdVon): Belegung[] {
  const names: Belegung[] = []
  for (const section of meeting.sections) {
    for (const item of section.items) {
      if (isSong(item)) continue
      // Beide Räume: wer im Hauptsaal UND in der Zusätzlichen Klasse steht,
      // ist zur selben Zeit an zwei Orten — genau das soll die Prüfung finden.
      for (const aux of raeume(meeting)) {
        for (const slot of slotsOf(item, aux)) {
          if (!slot.name || SKIP_ROLE.test(slot.rolle ?? '')) continue
          names.push(belegung(slot, wer))
        }
      }
    }
  }
  if (meeting.auxRatgeber?.name) names.push(belegung(meeting.auxRatgeber, wer))
  return names
}

/** Belegte Namen der Hilfsdienste (ohne Gruppen-Rotation). */
function meetingHelperNames(meeting: Meeting, services: Service[], wer: IdVon): Belegung[] {
  const names: Belegung[] = []
  for (const svc of services) {
    if (svc.groups) continue
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      const slot = arr[pos]
      if (slot?.name) names.push(belegung(slot, wer))
    }
  }
  return names
}

function meetingAssignedNames(meeting: Meeting, services: Service[], wer: IdVon): Belegung[] {
  return [...meetingPartNames(meeting, wer), ...meetingHelperNames(meeting, services, wer)]
}

/**
 * Eine belegte Stelle mit ihrer **Kennung**: die Person-Id, wo auflösbar, sonst
 * ein Namensschlüssel. Gezählt wird über die Kennung, angezeigt der Name.
 *
 * Ohne diese Trennung zählte die Konfliktprüfung über den Anzeigenamen: zwei
 * Personen desselben Namens galten als eine und lösten füreinander „doppelt
 * eingeteilt" aus. Der Namensschlüssel trägt ein Präfix, damit er nie
 * versehentlich mit einer echten Id zusammenfällt.
 */
interface Belegung {
  kennung: string
  name: string
}
type IdVon = (z: Zuteilung | undefined) => string | undefined

function belegung(z: Zuteilung, wer: IdVon): Belegung {
  const name = z.name ?? ''
  return { kennung: wer(z) ?? `name:${name}`, name }
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
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
): Conflict[] {
  const week = weeks[wi]
  if (!week) return []
  const conflicts: Conflict[] = []
  const werIst = idAufloeser(persons)
  const nachId = new Map(persons.map((p) => [p.id, p]))
  // Entfallene Zusammenkünfte fallen heraus (T30): wer an einem Tag nicht
  // drankommt, ist dort weder doppelt eingeteilt noch abwesend-und-eingeteilt.
  // Ein Warnbanner über eine Zusammenkunft, die gar nicht stattfindet, wäre
  // Lärm — und verdeckt die echten Konflikte daneben.
  const tabs = (tab ? [tab] : MEETING_TABS).filter((tb) => !istAusgefallen(week, tb))

  // absent: in dieser Woche abwesend, aber eingeteilt
  for (const tb of tabs) {
    const gesehen = new Set<string>()
    for (const b of meetingAssignedNames(week[tb], services, werIst)) {
      if (gesehen.has(b.kennung)) continue
      gesehen.add(b.kennung)
      const person = nachId.get(b.kennung)
      if (person && istAbwesend(abwesend, person.id, wi, tb)) {
        conflicts.push({ kind: 'absent', name: b.name, tab: tb })
      }
    }
  }

  // helperTask / double: gleiche Person mehrfach in einer Zusammenkunft.
  // helperTask = Hilfsdienst UND Programmpunkt am selben Tag (die vom Nutzer
  // vorgegebene Regel — bei manueller Zuteilung nicht automatisch verhindert);
  // double = mehrere Hilfsdienste am selben Tag. Zwei Programmpunkte (z. B.
  // Vorsitz + Anfangsgebet) sind bewusst KEIN Konflikt.
  for (const tb of tabs) {
    // Gezählt wird über die Kennung, angezeigt der Name — zwei Personen
    // desselben Namens sind zwei Einträge, nicht einer mit doppelter Zahl.
    const namen = new Map<string, string>()
    const zaehle = (aus: Belegung[]): Map<string, number> => {
      const m = new Map<string, number>()
      for (const b of aus) {
        m.set(b.kennung, (m.get(b.kennung) ?? 0) + 1)
        namen.set(b.kennung, b.name)
      }
      return m
    }
    const partCounts = zaehle(meetingPartNames(week[tb], werIst))
    const helperCounts = zaehle(meetingHelperNames(week[tb], services, werIst))
    for (const kennung of new Set([...partCounts.keys(), ...helperCounts.keys()])) {
      const pc = partCounts.get(kennung) ?? 0
      const hc = helperCounts.get(kennung) ?? 0
      const name = namen.get(kennung) ?? ''
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
  // Auch die Serie zählt über die Kennung: bei zwei Gleichnamigen entstand
  // sonst eine Serie, die keine ist — abwechselnd war je eine von beiden dran.
  const belegt = weeks.map((w) => {
    const aus = tab
      ? meetingPartNames(w[tab], werIst)
      : [...meetingPartNames(w.mid, werIst), ...meetingPartNames(w.we, werIst)]
    return new Map(aus.map((b) => [b.kennung, b.name]))
  })
  for (const [kennung, name] of belegt[wi] ?? []) {
    let start = wi
    let end = wi
    // „In Folge" heißt in aufeinanderfolgenden **Wochen**. Liegt zwischen zwei
    // Einträgen eine Woche, die es gar nicht gibt (Kongress), ist die Serie
    // dort unterbrochen — sonst meldete die App drei Wochen am Stück, wo in
    // Wirklichkeit eine Pause dazwischenlag (T36).
    const folgt = (a: number, b: number) => wochenAbstand(weeks[a], weeks[b], a, b) === 1
    while (start - 1 >= 0 && belegt[start - 1]?.has(kennung) === true && folgt(start - 1, start)) start--
    while (end + 1 < weeks.length && belegt[end + 1]?.has(kennung) === true && folgt(end, end + 1)) end++
    const run = end - start + 1
    if (run >= STREAK_THRESHOLD && run < weeks.length) {
      conflicts.push({ kind: 'streak', name, count: run })
    }
  }

  return conflicts
}
