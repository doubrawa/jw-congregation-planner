/**
 * Einen Platz von Hand besetzen und lesen: setzen und leeren, was jemand in
 * der Zusammenkunft schon hat, welche Plätze sich geändert haben und wann
 * jemand zuletzt in einem Bereich dran war.
 */

import { allePlaetze, platzKey, type Platz } from '../plaetze'
import { RATGEBER_ROLLE, ratgeberSlot, slotsOf } from '../aux-class'
import {
  dieselbePerson,
  gehoertZu,
  klonWoche,
  isSong,
  istAusgefallen,
  MEETING_TABS,
  serviceQualKey,
  type Zuteilung,
} from '../helpers'
import { wochenAbstand } from '../auslastung'
import { ratgeberKey } from '../../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { folgtAuswahlDemVorsitz, vorsitzPlatz } from './vorsitz'
import type {
  Meeting,
  MeetingAssignment,
  MeetingKey,
  MeetingSlotSelection,
  PartItem,
  Person,
  Service,
  SlotAssignment,
  SlotSelection,
  Week,
} from '../types'

/**
 * Der Aufgabenbereich eines Platzes, wie ihn `assignmentDistance` je Bereich
 * führt — und die Auswertung zählt.
 */
export function bereichVon(platz: Platz): string | undefined {
  if (platz.art === 'helper') return serviceQualKey(platz.svc.key)
  return platz.art === 'ratgeber' ? 'ratgeber' : platz.slot.bereichsKey
}

/**
 * **Wann war jemand zuletzt in diesem Bereich dran?** — je Person die Wochen
 * vor der geplanten, in der er zuletzt einen Platz dieses Bereichs hatte: das
 * „zuletzt vor 12 Wochen" im Zuteilen-Blatt.
 *
 * Anders als `assignmentDistance` nur **davor**: Was danach schon geplant ist,
 * ist kein „zuletzt". Und nur Zusammenkünfte, die stattfanden. Wer im
 * geladenen Bestand davor nie dran war, fehlt.
 */
export function zuletztImBereich(
  weeks: readonly Week[],
  wi: number,
  bereich: string,
  services: readonly Service[],
  wer: (z: Zuteilung | undefined) => string | undefined,
): Map<string, number> {
  const out = new Map<string, number>()
  const ziel = weeks[wi]
  if (!ziel) return out
  const zielMs = Date.parse(ziel.start)
  for (const week of weeks) {
    if (!(Date.parse(week.start) < zielMs)) continue
    const d = wochenAbstand(week, ziel)
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      for (const platz of allePlaetze(week[tab], services)) {
        if (bereichVon(platz) !== bereich) continue
        const id = wer(platz.slot)
        if (id && (out.get(id) ?? Infinity) > d) out.set(id, d)
      }
    }
  }
  return out
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
  // Folgt der bearbeitete Platz dem Vorsitz (Anfangsgebet, Vortrag des
  // Vorsitzenden), ist der Vorsitz desselben Mannes kein Doppel, sondern der
  // Grund — sonst stünde der Richtige als „heute schon Vorsitz" weiter unten
  // in der Liste.
  const vorsitz = folgtAuswahlDemVorsitz(meeting, exclude) ? vorsitzPlatz(meeting) : undefined
  // Programm (beide Räume) und Ratgeber in einem Durchlauf: die Plätze der
  // Zusätzlichen Klasse sind gleichwertige Zuteilungen. Ohne sie bliebe der
  // Hinweis „heute schon zugeteilt" aus, das Dashboard zeigte „frei" für
  // jemanden, der in der Klasse eingeteilt ist, und takeSubstitute übersähe
  // den Konflikt.
  for (const platz of allePlaetze(meeting)) {
    if (!gehoertZu(platz.slot, person)) continue
    if (platz.art === 'ratgeber') {
      // Der eigene Platz im Blatt „Ratgeber" ist keine Doppelbelegung — wie bei
      // jedem anderen Platz.
      if (exclude?.kind === 'ratgeber') continue
      out.push({ text: RATGEBER_ROLLE, lang: 'u' })
      continue
    }
    if (platz.slot === vorsitz) continue
    const { slot, si, item, ii, ni, aux } = platz
    if (
      exclude?.kind === 'part' &&
      exclude.si === si &&
      exclude.ii === ii &&
      exclude.ni === ni &&
      (exclude.aux === true) === aux
    ) {
      continue
    }
    const rolle = slot.rolle ?? ''
    // Rolle bevorzugen (Vorsitz/Gebet/Leiter/Leser …), sonst den Titel.
    if (rolle) out.push({ text: rolle, lang: 'u' })
    else out.push({ text: item.title, lang: 'p' })
  }
  // Hilfsdienste über **alles Gespeicherte**, nicht nur bis `svc.count`: Wer
  // hinter einer nachträglich verkleinerten Platzzahl steht, ist an diesem Tag
  // trotzdem eingeteilt (siehe `gespeicherteHelfer`).
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
  herkunft?: string,
): Week[] {
  const next = klonWoche(weeks, sel.wi)
  if (!next) return weeks
  // Zeigt die Auswahl ins Leere — die Woche ist aus dem geladenen Fenster
  // gerutscht, der Punkt wurde nebenher gelöscht —, bleibt alles, wie es war.
  // Sonst würfe der Zugriff, und das mitten im Reducer.
  const meeting = next[sel.wi]?.[sel.tab]
  if (!meeting) return weeks
  /*
   * **Dieselbe Besetzung noch einmal: die Eingabe zurück.** Sonst bekäme, wer
   * im Blatt dieselbe Person erneut antippt, eine neue, gleiche Woche — und die
   * ginge hinaus (`persist` liest an der Identität ab, was zu schreiben ist).
   * Jedes Schreiben hebt den Stand der Woche; die nächste Änderung eines anderen
   * Planers an ihr gälte dann als Konflikt.
   */
  const gleich = (slot: SlotAssignment | undefined): boolean =>
    slot !== undefined && slot.name === name && slot.pid === (name && pid ? pid : undefined)
  if (sel.kind === 'ratgeber') {
    if (gleich(meeting.auxRatgeber)) return weeks
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
    if (gleich(slot) && (rolle === undefined || slot.rolle === rolle) && (herkunft === undefined || (slot.herkunft ?? '') === herkunft)) {
      return weeks
    }
    slot.name = name
    // Person-Id als stabile Identität mitführen; beim Entfernen bzw. bei
    // externen Rednern (kein pid) das Feld sauber löschen.
    if (name && pid) slot.pid = pid
    else delete slot.pid
    // Rolle und Herkunft getrennt: die Rolle trägt die Regel, die Versammlung
    // wird nur angezeigt. Ein leerer Wert löscht das Feld, statt eine leere
    // Zeichenkette zu hinterlassen.
    if (rolle !== undefined) slot.rolle = rolle
    if (herkunft !== undefined) {
      if (herkunft) slot.herkunft = herkunft
      else delete slot.herkunft
    }
  } else {
    const alt = meeting.helpers[sel.svc]?.[sel.pos]
    if (gleich(alt) || (alt === undefined && !name)) return weeks
    const arr = meeting.helpers[sel.svc] ?? []
    while (arr.length <= sel.pos) arr.push({ name: '' })
    arr[sel.pos] = name && pid ? { name, pid } : { name }
    meeting.helpers[sel.svc] = arr
  }
  return next
}

/**
 * Steht auf einem Platz noch dieselbe Besetzung? Leer bleibt leer; sonst
 * entscheidet `dieselbePerson` — die Person-Id, wo beide Seiten eine tragen.
 */
function gleicheBesetzung(
  a: { name: string; pid?: string } | undefined,
  b: { name: string; pid?: string } | undefined,
): boolean {
  const vorher = { name: a?.name ?? '', pid: a?.pid }
  const nachher = { name: b?.name ?? '', pid: b?.pid }
  if (!vorher.name || !nachher.name) return vorher.name === nachher.name
  return dieselbePerson(vorher, nachher)
}

/**
 * task_keys aller Slots, deren Besetzung sich zwischen zwei Ständen derselben
 * Zusammenkunft geändert hat (Zuteilen, Entfernen, Auto-Zuteilung). Für diese
 * Slots wird der Bestätigungs-Status abgeräumt — sonst erbt die neu
 * eingeteilte Person ein fremdes „bestätigt“/„verhindert“.
 *
 * **Verglichen wird die Person, nicht der Name.** Am Namen gemessen erbte ein
 * Namensvetter mit anderer Person-Id die Zusage seines Vorgängers — und die
 * Ampel im Planen zeigte ihn grün, obwohl ihn nie jemand gefragt hat.
 * Dieselbe Rangfolge wie bei den Treffpunkten (`fsVerwaisteZusagen`) und beim
 * Entzug (`entzogeneZuteilungen`).
 *
 * **Der Punkt von vorher wird über seine Kennung gesucht, nicht über seine
 * Stelle in der Liste** — wie der Schlüssel. Über die Position
 * (`prev.sections[si]?.items[ii]`) träfe es einen anderen Punkt, sobald eine
 * Aktion umsortiert und zuteilt zugleich, und räumte die Zusage des falschen
 * Punkts ab.
 */
export function changedSlotKeys(
  prev: Meeting,
  next: Meeting,
  services: Service[],
  woche: string,
  tab: MeetingKey,
): string[] {
  const keys: string[] = []
  const vorherNachKennung = new Map<string, PartItem>()
  for (const section of prev.sections) {
    for (const item of section.items) if (!isSong(item)) vorherNachKennung.set(item.iid, item)
  }
  for (const platz of allePlaetze(next, services)) {
    if (platz.art === 'programm') {
      const prevItem = vorherNachKennung.get(platz.item.iid)
      const vorher = prevItem ? slotsOf(prevItem, platz.aux) : []
      if (!gleicheBesetzung(vorher[platz.ni], platz.slot)) keys.push(platzKey(platz, woche, tab))
    } else if (platz.art === 'helper') {
      const prevArr = prev.helpers[platz.svc.key] ?? []
      if (!gleicheBesetzung(prevArr[platz.pos], platz.slot)) keys.push(platzKey(platz, woche, tab))
    }
    // Der Ratgeber steht darunter, nicht hier: Ein Durchlauf über **eine**
    // Seite sähe nicht, dass es ihn vorher gab und jetzt nicht mehr.
  }
  if (!gleicheBesetzung(prev.auxRatgeber, next.auxRatgeber)) {
    keys.push(ratgeberKey(woche, tab))
  }
  return keys
}
