/**
 * Die Auto-Zuteilung: „Automatisch" und „Leeren" für eine Zusammenkunft in
 * fünf Schritten, die Rangfolge für das Zuteilen-Blatt und der feste
 * Studienleiter einer neu geholten Woche.
 */

import { buildAbsences, istAbwesend, KEINE_ABWESENHEIT, type AbsenceSet } from '../absence'
import { allePlaetze, gespeicherteHelfer, leerVorOrt } from '../plaetze'
import { programmPlaetze, ratgeberSlot, slotsOf } from '../aux-class'
import {
  displayName,
  gehoertZu,
  isGuestRole,
  klonWoche,
  isSong,
  istAusgefallen,
  MEETING_TABS,
  idAufloeser,
  ROLE_GUEST_SPEAKER,
  ROLE_OWN_SPEAKER,
  rolleBasis,
  serviceQualKey,
} from '../helpers'
import { schlussgebetVorOrt } from '../../../supabase/functions/_shared/planung.ts'
import { festerWtLeiter, folgtDemVorsitzIn, istWtLeiter, vorsitzPlatz, wtLeiterPlaetze } from './vorsitz'
import { eingeteilte, ratgeberOpts, schuelerteilOpts, waehler, type Waehler } from './waehler'
import type {
  Absence,
  Group,
  Meeting,
  MeetingKey,
  MeetingTimes,
  MeetingSlotSelection,
  Person,
  Service,
  Week,
} from '../types'

/**
 * Zuteilungslogik — Kernregeln aus dem Design-Handoff ("Interaktionen &
 * Verhalten"): nur Qualifizierte, Abwesende blockiert, Auslastung über alle
 * geladenen Wochen, Auto-Zuteilung wählt geringste Auslastung, Reinigung
 * rotiert über die Predigtdienstgruppen, die reinigen (Wochenindex mod deren
 * Zahl), Gastredner-Slots werden übersprungen.
 *
 * Alle Funktionen sind pur (Eingaben bleiben unverändert) — geeignet für
 * den Reducer und später direkt testbar.
 */

/**
 * Rollen, die die Auto-Zuteilung nicht besetzt (kommen von außen).
 *
 * Das Vokabular selbst steht in `helpers.ts` — dort, wo `gehoertZu` entscheidet,
 * wem eine Zuteilung gehört, und wo es deshalb gebraucht wird (`helpers.ts` ist
 * die untere Schicht und darf nicht auf `planung/` zugreifen). Gefragt wird
 * über `isGuestRole` — eine zweite Abschrift des Ausdrucks wäre eine zweite
 * Gelegenheit, das Vokabular zu ändern und hier zu vergessen.
 */

export interface AutoAssignResult {
  weeks: Week[]
  count: number // Anzahl vergebener Zuteilungen
  newly: string[] // neu vergebene Personennamen (Mitteilungstexte, Tests)
  unfilled: number // offen gebliebene Slots ohne passenden/freien Kandidaten
}

/** Umfang der Auto-Zuteilung: nur Programmpunkte, nur Hilfsdienste, oder beides. */
export type AssignScope = 'all' | 'parts' | 'helpers'

/**
 * Worauf „Automatisch" und „Leeren" wirken (T121, Entwurf `GAutomatisch`):
 * auf die gezeigte Zusammenkunft (`tag`) oder auf beide der Woche (`woche`).
 */
export type Umfang = 'tag' | 'woche'

/**
 * **Die Zusammenkünfte eines Umfangs** — die gezeigte oder beide der Woche,
 * ausgefallene nie: Ihre Zuteilungen ruhen nur (`eachAssignedSlot`), zu
 * besetzen gibt es dort nichts (`autoAssignMeeting`), und wer leert, meint die
 * Abende, die stattfinden. Das Blatt zählt und der Reducer wirkt über dieselbe
 * Liste — sonst versprächen die Zahlen etwas, das der Knopf nicht tut.
 */
export function tabsImUmfang(week: Week | undefined, gezeigt: MeetingKey, umfang: Umfang): MeetingKey[] {
  const tabs = umfang === 'tag' ? [gezeigt] : MEETING_TABS
  return tabs.filter((tab) => !istAusgefallen(week, tab))
}

/**
 * 1) Den Wachtturm-Studium-Leiter zuerst reservieren, damit ihn kein anderer
 *    Platz wegnimmt.
 *
 * Alle fünf Schritte geben zurück, wie viele Plätze sie offen lassen mussten.
 */
function wtLeiterZuerst(meeting: Meeting, w: Waehler): number {
  let unfilled = 0
  for (const slot of wtLeiterPlaetze(meeting)) {
    if (slot.name) continue
    const person = w.pickConductor()
    if (person) w.vergeben('part', person, slot)
    else unfilled++
  }
  return unfilled
}

/**
 * 2) Die übrigen Programmpunkte — beide Räume in derselben Schleife: Ihre
 *    Plätze sind gleichwertige Aufgaben und teilen sich die Sperrliste mit dem
 *    Hauptsaal; niemand kann zur selben Zeit in beiden Räumen sein.
 *
 * Was dem Vorsitz folgt, bleibt aus und wird in Schritt 4 an ihn gekoppelt.
 * Den Leiter des Wachtturm-Studiums hat Schritt 1 schon versucht, mit
 * denselben Bewerbern; fand er niemanden, zählte er hier ein zweites Mal als
 * offen (bis zum 16.10.2026).
 */
function programmpunkteBesetzen(meeting: Meeting, w: Waehler, persons: Person[]): number {
  let unfilled = 0
  for (const { slot, section, item, aux } of programmPlaetze(meeting)) {
    if (slot.name || isGuestRole(slot.rolle)) continue
    if (folgtDemVorsitzIn(meeting, section, slot) || istWtLeiter(section, slot)) continue
    if (schlussgebetVorOrt(meeting.sections, section, slot)) continue
    // Schülerteile (gold): Geschlecht/Partner/Verteilung berücksichtigen.
    const person = w.pick('part', slot.bereichsKey, schuelerteilOpts(item, slot, aux, persons))
    if (person) w.vergeben('part', person, slot)
    else unfilled++
  }
  return unfilled
}

/**
 * 3) Der Ratgeber der Zusätzlichen Klasse — eigener Bereich, eine Person je
 *    Zusammenkunft, und nur, wenn die Woche überhaupt eine Klasse hat.
 */
function ratgeberBesetzen(meeting: Meeting, w: Waehler): number {
  const ratgeber = meeting.auxRatgeber
  if (!ratgeber || ratgeber.name) return 0
  const person = w.pick('part', 'ratgeber', ratgeberOpts(ratgeber))
  if (!person) return 1
  w.vergeben('part', person, ratgeber)
  return 0
}

/**
 * 4) Der Vorsitz betet zu Beginn (Standard, von Hand änderbar), liest am
 *    Wochenende den Wachtturm (T131) und hält, wo das Arbeitsheft es so nennt,
 *    den „Vortrag des Vorsitzenden" — die einzigen erlaubten Doppel-Aufgaben.
 *    Gekoppelt wird nur, was noch offen ist.
 *
 * Welche Plätze das sind, sagt `folgtDemVorsitzIn` — geteilt mit `bedarf`, dem
 * Angebot freier Plätze und `assignmentsInMeeting`. Schritt 2 wählt für sie
 * niemanden: Die gemeinsame Sperrliste setzte dort sonst einen **anderen**
 * Bruder hin, als hielte ein zweiter Vorsitzender den Vortrag (Arbeitsheft ab
 * Januar 2027, `ministryNames` im Import) — und mit nur einem, der den Vorsitz
 * kann, blieb er offen.
 */
function anVorsitzKoppeln(meeting: Meeting, w: Waehler, persons: Person[]): void {
  const vorsitzSlot = vorsitzPlatz(meeting)
  if (!vorsitzSlot?.name) return
  const vorsitz = persons.find((p) => p.id === w.werIst(vorsitzSlot))
  // Id vor Name: Trägt der Vorsitz nur einen Namen (Altbestand), bekommt der
  // gekoppelte Platz trotzdem die Id der Person dahinter (16.10.2026).
  const pid = vorsitzSlot.pid ?? vorsitz?.id
  for (const { slot, section } of programmPlaetze(meeting)) {
    if (slot === vorsitzSlot || slot.name || !folgtDemVorsitzIn(meeting, section, slot)) continue
    slot.name = vorsitzSlot.name
    if (pid) slot.pid = pid // dieselbe Person
    w.mitzaehlen(vorsitz)
  }
}

/**
 * 5) Die Hilfsdienste — zuletzt, damit Helfer und Aufgaben sich über die
 *    Sperrliste gegenseitig ausschließen; ausgewählt wird nach Gesamtlast.
 */
function hilfsdiensteBesetzen(meeting: Meeting, services: Service[], w: Waehler): number {
  let unfilled = 0
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if (arr[pos]?.name) continue
      while (arr.length <= pos) arr.push({ name: '' })
      // Auch eine Lücke in der Reihe bekommt einen Platz — sonst bliebe sie
      // `undefined` und die Zuteilung liefe ins Leere.
      const platz = arr[pos] ?? { name: '' }
      arr[pos] = platz
      if (svc.groups) {
        // Die Reinigung geht an eine Gruppe, an keine Person — daher keine pid.
        // Reinigt keine (alle aus der Reinigung genommen), bleibt der Platz offen.
        if (!w.reinigung) {
          unfilled++
          continue
        }
        platz.name = w.reinigung
        delete platz.pid
        w.mitzaehlen()
        continue
      }
      const person = w.pick('helper', serviceQualKey(svc.key))
      if (person) w.vergeben('helper', person, platz)
      else unfilled++
    }
    meeting.helpers[svc.key] = arr
  }
  return unfilled
}

/**
 * Auto-Zuteilung für eine Woche+Meeting. Regeln (siehe README/Design):
 *  - Kandidaten: qualifiziert, in dieser Woche anwesend, noch nicht in diesem
 *    Meeting eingeteilt. Niemand bekommt Hilfsdienst UND Programmpunkt am
 *    selben Tag (gemeinsame Sperrliste; Ausnahme Vorsitz+Gebet).
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
 *
 * Die Reihenfolge der fünf Schritte ist bedeutungstragend: Jeder verkleinert
 * das Feld für den nächsten.
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
  const next = klonWoche(weeks, weekIndex)
  if (!next) return { weeks, count: 0, newly: [], unfilled: 0 }
  // Entfällt die Zusammenkunft, gibt es nichts zu besetzen (T30). Ohne diese
  // Zeile verteilte „Automatisch zuteilen" Aufgaben für einen Abend, an dem
  // niemand zusammenkommt — und benachteiligte die Gewählten anschließend bei
  // der nächsten echten Zusammenkunft, weil sie als ausgelastet gälten.
  const meeting = next[weekIndex]?.[tab]
  if (!meeting || istAusgefallen(next[weekIndex], tab)) {
    return { weeks, count: 0, newly: [], unfilled: 0 }
  }

  const w = waehler(weeks, weekIndex, tab, meeting, persons, services, groups, abwesend)
  let unfilled = 0

  // Umfang: Programmpunkte (Aufgaben) und/oder Hilfsdienste getrennt zuteilbar.
  if (scope !== 'helpers') {
    unfilled += wtLeiterZuerst(meeting, w)
    unfilled += programmpunkteBesetzen(meeting, w, persons)
    unfilled += ratgeberBesetzen(meeting, w)
    anVorsitzKoppeln(meeting, w, persons)
  }
  if (scope !== 'parts') {
    unfilled += hilfsdiensteBesetzen(meeting, services, w)
  }

  return { weeks: next, count: w.ergebnis.count, newly: w.ergebnis.newly, unfilled }
}

/**
 * **In welcher Reihenfolge „Automatisch" für diesen einen Platz wählen würde**
 * (T121, Phase 5d) — die erste Person ist der „Vorschlag" im Zuteilen-Blatt,
 * die übrigen stehen in derselben Ordnung darunter. Derselbe Wähler und
 * dieselben Regeln je Platz wie in `autoAssignMeeting` (fester Studienleiter,
 * Schülerteile, Ratgeber, Hilfsdienste nach Gesamtlast) — sonst schlüge das
 * Blatt jemand anderen vor, als der Knopf „Automatisch" nähme.
 *
 * Leer, wo die Automatik nicht wählt — Gastredner und Kreisaufseher, die
 * Reinigung (sie rotiert über die Gruppen), eine ausgefallene Zusammenkunft.
 * Was dem Vorsitz folgt (Anfangsgebet, am Wochenende das Lesen, Vortrag des
 * Vorsitzenden, `folgtDemVorsitzIn`), bekommt der Vorsitzende, wie in
 * Schritt 4 — leer nur, solange der Vorsitz leer ist. Wer in dieser
 * Zusammenkunft schon eingeteilt ist, auch auf diesem Platz, steht nicht
 * darin: Gefragt ist, wer käme.
 */
export function rangfolgeFuer(
  weeks: Week[],
  sel: MeetingSlotSelection,
  persons: Person[],
  services: Service[],
  groups: Group[],
  abwesend: AbsenceSet,
): Person[] {
  const week = weeks[sel.wi]
  const meeting = week?.[sel.tab]
  if (!meeting || istAusgefallen(week, sel.tab)) return []
  const w = waehler(weeks, sel.wi, sel.tab, meeting, persons, services, groups, abwesend)
  if (sel.kind === 'ratgeber') return w.rangfolge('part', 'ratgeber', ratgeberOpts(ratgeberSlot(meeting)))
  if (sel.kind === 'helper') {
    const svc = services.find((s) => s.key === sel.svc)
    return svc && !svc.groups ? w.rangfolge('helper', serviceQualKey(svc.key)) : []
  }
  const section = meeting.sections[sel.si]
  const item = section?.items[sel.ii]
  if (!section || !item || isSong(item)) return []
  const slot = slotsOf(item, sel.aux === true)[sel.ni]
  if (!slot || isGuestRole(slot.rolle)) return []
  // Das Schlussgebet am Wochenende besetzt die Automatik nicht, also schlägt das Blatt niemanden vor (T133).
  if (schlussgebetVorOrt(meeting.sections, section, slot)) return []
  if (folgtDemVorsitzIn(meeting, section, slot)) {
    // Was dem Vorsitz folgt, schlägt die App dem Vorsitzenden vor (16.10.2026) —
    // bis dahin schlug sie niemanden vor und listete ihn als „heute schon dran".
    const vorsitz = vorsitzPlatz(meeting)
    const er = vorsitz?.name ? persons.find((p) => gehoertZu(vorsitz, p)) : undefined
    return er ? [er] : []
  }
  if (istWtLeiter(section, slot)) return w.rangfolgeLeiter()
  return w.rangfolge('part', slot.bereichsKey, schuelerteilOpts(item, slot, sel.aux === true, persons))
}

/**
 * **Der feste Studienleiter in einer neuen Woche** (18.10.2026, Wunsch des
 * Betreibers): Den Leiter-Platz des Wachtturm-Studiums bekommt schon beim
 * Holen der feste Leiter — ist er an dem Tag abwesend oder in der
 * Zusammenkunft schon eingeteilt (hält er etwa den öffentlichen Vortrag), sein
 * Vertreter. Danach ist es eine Zuteilung wie jede andere.
 *
 * Besetzt wird nur ein leerer Platz und nicht in einer gestrichenen
 * Zusammenkunft. Kann keiner von beiden, bleibt der Platz offen: Wer ihn dann
 * bekommt, entscheidet die Auslastung, und die gehört der Automatik.
 *
 * Eine Abwesenheit, die erst nach dem Holen hinzukommt, ändert den Plan nicht
 * von selbst (Betreiber, 18.10.2026): Die Planung zeigt den Konflikt, und der
 * Vorschlag im Zuteilen-Blatt nennt den Vertreter.
 *
 * Aufgerufen über `neueWocheEinordnen` (der Knopf in der App, das Skript
 * `wochen-importieren.mjs`) und vom Wochenplan-Import aus New World Scheduler:
 * NWS führt den Studienleiter als Einstellung der Versammlung, nicht je Woche.
 *
 * `eingetragen` nennt, wer einen Platz bekam; ist es leer, ist `week` die
 * Eingabe selbst.
 */
export function festenWtLeiterEintragen(
  week: Week,
  persons: readonly Person[],
  absences: readonly Absence[],
  zeiten: MeetingTimes,
): { week: Week; eingetragen: Person[] } {
  const kopie = klonWoche([week], 0)?.[0]
  if (!kopie) return { week, eingetragen: [] }
  const abwesend = buildAbsences(absences, [kopie], zeiten)
  const werIst = idAufloeser(persons)
  const eingetragen: Person[] = []
  for (const tab of MEETING_TABS) {
    if (istAusgefallen(kopie, tab)) continue
    const meeting = kopie[tab]
    const eingeteilt = eingeteilte(meeting, werIst)
    for (const slot of wtLeiterPlaetze(meeting)) {
      if (slot.name) continue
      const leiter = festerWtLeiter(persons, (p) => !istAbwesend(abwesend, p.id, 0, tab) && !eingeteilt.has(p.id))
      if (!leiter) continue
      slot.name = displayName(leiter)
      slot.pid = leiter.id
      eingeteilt.add(leiter.id)
      eingetragen.push(leiter)
    }
  }
  return eingetragen.length ? { week: kopie, eingetragen } : { week, eingetragen }
}

/**
 * **Was „Automatisch" vorfindet** (T121, Entwurf `GAutomatisch`): die besetzten
 * und alle Plätze eines Bereichs, gezählt, wie die Auto-Zuteilung sie sieht —
 * ohne die Plätze externer Redner (Gastredner, Kreisaufseher), die sie nicht
 * besetzt und das Leeren stehen lässt.
 */
export function zuteilbarePlaetze(
  meeting: Meeting,
  services: readonly Service[],
  bereich: Exclude<AssignScope, 'all'>,
): { besetzt: number; gesamt: number } {
  let besetzt = 0
  let gesamt = 0
  for (const platz of allePlaetze(meeting, services)) {
    if ((platz.art === 'helper') !== (bereich === 'helpers')) continue
    if (platz.art !== 'helper' && isGuestRole(platz.slot.rolle)) continue
    if (leerVorOrt(meeting, platz)) continue
    gesamt++
    if (platz.slot?.name) besetzt++
  }
  return { besetzt, gesamt }
}

/**
 * Leert die Zuteilungen einer Woche+Meeting — das Gegenstück zur Auto-Zuteilung.
 * `scope`:
 *  - 'parts'   entfernt die Namen der Programmpunkte. Externe Redner
 *    (Gastredner/Kreisaufseher) bleiben stehen, genau wie die Auto-Zuteilung sie
 *    nicht besetzt — sie kommen von außen und werden manuell eingetragen.
 *  - 'helpers' entfernt die Namen aller Hilfsdienste (inkl. Reinigungsgruppe).
 *  - 'all'     beides (T121: im Blatt „Automatisch" sind beide Bereiche wählbar).
 * Programmstruktur, Rollen, Vortragsthemen und Lieder bleiben unverändert.
 * Pur — die Eingabe bleibt unangetastet. `count` = Anzahl geleerter Slots.
 */
export function clearAssignments(
  weeks: Week[],
  weekIndex: number,
  tab: MeetingKey,
  scope: AssignScope,
): { weeks: Week[]; count: number } {
  const next = klonWoche(weeks, weekIndex)
  if (!next) return { weeks, count: 0 }
  const meeting = next[weekIndex]?.[tab]
  if (!meeting) return { weeks, count: 0 }
  let count = 0
  if (scope !== 'helpers') {
    // Programm (beide Räume) und Ratgeber: „Leeren" meint die Aufgaben dieser
    // Ansicht, und die Zusätzliche Klasse gehört dazu. Ohne `services`, denn
    // die Hilfsdienste sind der andere Umfang.
    //
    // Geändert wird an Ort und Stelle: `klonWoche` hat die Woche tief kopiert,
    // die Plätze aus dem Durchlauf gehören also schon zur neuen Fassung.
    for (const platz of allePlaetze(meeting)) {
      const slot = platz.slot
      if (isGuestRole(slot.rolle)) continue // externer Redner bleibt
      if (!slot.name) continue
      slot.name = ''
      delete slot.pid
      // Ein geleerter Redner-Platz fällt auf „Gastredner" zurück — den
      // Ausgangszustand aus dem Import. Bliebe er auf „Redner" stehen, wäre er
      // ein offener Slot, den die Auto-Zuteilung besetzt; den Redner des
      // öffentlichen Vortrags vereinbart man aber, man verlost ihn nicht.
      // Derselbe Rückfall wie beim „Entfernen" — ohne Versammlung: Bis zum
      // 21.10.2026 blieb die eines Gastredners davor am eigenen Redner hängen.
      if (rolleBasis(slot.rolle) === ROLE_OWN_SPEAKER) {
        slot.rolle = ROLE_GUEST_SPEAKER
        delete slot.herkunft
      }
      count++
    }
  }
  if (scope !== 'parts') {
    // Über alles Gespeicherte — auch hinter einer verkleinerten Platzzahl und
    // zu Diensten, die es nicht mehr gibt: „leeren" heißt leeren.
    for (const { slot } of gespeicherteHelfer(meeting)) {
      if (!slot.name) continue
      slot.name = ''
      delete slot.pid
      count++
    }
  }
  return { weeks: next, count }
}
