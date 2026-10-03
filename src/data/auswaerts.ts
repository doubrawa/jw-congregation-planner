/**
 * Redner auswärts (T120, Phase 4) — reine Logik.
 *
 * Eigene Redner halten den öffentlichen Vortrag in anderen Versammlungen: das
 * Gegenstück zu den Rednern, die aus umliegenden Versammlungen kommen („Sind
 * genügend Redner vorhanden, wird jede Woche ein öffentlicher Vortrag gehalten.
 * Das ist oft dadurch möglich, dass Redner aus umliegenden Versammlungen
 * eingeladen werden." — od Kap. 7 Abs. 14). Einen eigenen Namen für den Plan
 * nennen die veröffentlichten Schriften nicht; er bleibt beim Wortlaut der
 * Vorlage.
 *
 * Ein Vortrag ist eine Zeile mit Tag, Uhrzeit, Versammlung, Nummer und Redner.
 * Der Redner bestätigt ihn wie jede andere Aufgabe (`va|<montag>|<id>`), wird
 * erinnert und über „Plan senden" benachrichtigt. Am selben Tag steht er der
 * eigenen Zusammenkunft nicht zur Verfügung (`buildAuswaerts` in absence.ts).
 *
 * Alle Funktionen sind pur.
 */

import { istAbwesendAm } from './absence'
import { displayName, istAusgefallen, MEETING_TABS } from './helpers'
import { fromIso, isoDay, kalendertagMs, meetingDate, montagVon, tagVorbei, versatzAbMontag } from './meeting-dates'
import { assignmentsInMeeting, zusageStatus } from './planning'
import { neuesterVersand, nochNichtGemeldet, type EntzogeneZusage, type OffeneMeldung } from './plan-versand'
import { vaKey } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import {
  offeneVortraegeAuswaerts,
  VA_ROLLE,
  vaTerminText as vaTerminTextEdge,
} from '../../supabase/functions/_shared/zuteilungen.ts'
import type {
  Absence,
  ConfirmationMap,
  MeetingAssignment,
  MeetingKey,
  MeetingTimes,
  MyTask,
  Person,
  SentLog,
  Service,
  VortragAuswaerts,
  Week,
} from './types'

/** Wer zur Wahl steht: die Redner der eigenen Versammlung (Aufgabenbereich „Vorträge"). */
export const VA_BEREICH = 'vortrag'

/** Der Aufgaben-Schlüssel eines Vortrags (`va|<montag>|<id>`). */
export function vaTaskKey(v: Pick<VortragAuswaerts, 'id' | 'datum'>): string {
  return vaKey(montagVon(v.datum), v.id)
}

/**
 * Termin eines Vortrags, kanonisch deutsch: „Sonntag, 8. November · 10:00 ·
 * Vers. Südstadt". Gebaut im geteilten Edge-Ordner, damit „Meine Aufgaben",
 * Erinnerung und „Plan senden" dieselbe Zeile nennen.
 */
export function vaTerminText(v: Pick<VortragAuswaerts, 'datum' | 'zeit' | 'versammlung'>): string {
  return vaTerminTextEdge(montagVon(v.datum), versatzAbMontag(fromIso(v.datum).getDay()), v.zeit, v.versammlung)
}

/** Ist der Vortrag vorbei (der Tag ist um)? */
export function vaVorbei(v: Pick<VortragAuswaerts, 'datum'>, heute = new Date()): boolean {
  return tagVorbei(v.datum, heute)
}

/**
 * Steht der Reiter „Redner auswärts" da? Beim Planen für Planer immer — dort
 * wird der erste Vortrag eingetragen. Beim Ansehen, sobald einer kommt: Ein
 * Verkündiger bekommt nur seine eigenen (RLS), und ohne einen bliebe ein
 * leerer Reiter. So hält es auch der Predigtdienst mit den Gruppenbesuchen.
 */
export function vaReiterSichtbar(args: {
  planen: boolean
  planner: boolean
  vortraege: readonly VortragAuswaerts[]
  heute?: Date
}): boolean {
  const { planen, planner, vortraege, heute = new Date() } = args
  return planen ? planner : vortraege.some((v) => !vaVorbei(v, heute))
}

/** Vorträge nach Tag und Uhrzeit — die Reihenfolge im Zustand. */
export function vaNachDatum(vortraege: readonly VortragAuswaerts[]): VortragAuswaerts[] {
  return [...vortraege].sort((a, b) => a.datum.localeCompare(b.datum) || a.zeit.localeCompare(b.zeit))
}

/**
 * Die eigenen Vorträge als **Aufgaben** — wie ein Platz einer Zusammenkunft:
 * offen, bis der Redner bestätigt. Die Rolle steht kanonisch deutsch
 * (`VA_ROLLE`), übersetzt wird beim Anzeigen.
 */
export function deriveMyVaTasks(
  vortraege: readonly VortragAuswaerts[],
  personId: string | undefined,
  confirmations: ConfirmationMap,
): MyTask[] {
  if (!personId) return []
  return vortraege
    .filter((v) => v.pid === personId)
    .map((v) => {
      const key = vaTaskKey(v)
      return {
        id: key,
        title: '',
        rolle: VA_ROLLE,
        date: vaTerminText(v),
        at: kalendertagMs(fromIso(v.datum)),
        status: zusageStatus(confirmations, key),
        s89: null,
      }
    })
}

/** Ein möglicher Konflikt eines Vortrags auswärts. */
export interface VaKonflikt {
  vortrag: VortragAuswaerts
  name: string
  /** `abwesend`: an dem Tag abwesend; `zusammenkunft`: in der eigenen eingeteilt. */
  art: 'abwesend' | 'zusammenkunft'
  /** Bei `zusammenkunft`: was er dort hat (Rollen, sonst Titel). */
  aufgaben: MeetingAssignment[]
}

/**
 * **Doppelbelegung** von der Seite des Vortrags: Der Redner ist an dem Tag
 * abwesend — oder in der eigenen Zusammenkunft eingeteilt. Nur Kommendes;
 * geprüft werden die geladenen Wochen (eine Zusammenkunft, die es noch nicht
 * gibt, hat auch noch keine Zuteilung).
 */
export function vaKonflikte(args: {
  vortraege: readonly VortragAuswaerts[]
  weeks: readonly Week[]
  persons: readonly Person[]
  absences: readonly Absence[]
  services: Service[]
  zeiten: MeetingTimes
  heute?: Date
}): VaKonflikt[] {
  const { vortraege, weeks, persons, absences, services, zeiten, heute = new Date() } = args
  // Die Tage der eigenen Zusammenkünfte einmal vorab.
  const tage: { week: Week; tab: MeetingKey; tag: string }[] = []
  for (const week of weeks) {
    for (const tab of MEETING_TABS) {
      if (!istAusgefallen(week, tab)) tage.push({ week, tab, tag: isoDay(meetingDate(week, tab, zeiten)) })
    }
  }
  const out: VaKonflikt[] = []
  for (const v of vortraege) {
    if (!v.pid || vaVorbei(v, heute)) continue
    const person = persons.find((p) => p.id === v.pid)
    if (!person) continue
    const name = displayName(person)
    if (istAbwesendAm(absences, person.id, fromIso(v.datum))) {
      out.push({ vortrag: v, name, art: 'abwesend', aufgaben: [] })
      continue
    }
    const aufgaben = tage
      .filter((t) => t.tag === v.datum)
      .flatMap((t) => assignmentsInMeeting(t.week[t.tab], person, services))
    if (aufgaben.length > 0) out.push({ vortrag: v, name, art: 'zusammenkunft', aufgaben })
  }
  return out
}

/**
 * Was „Plan senden" hier noch zu tun hat: Vorträge mit Redner, unbestätigt,
 * kommend und nicht im Tagebuch — gerechnet mit derselben Funktion, mit der
 * `send-plan` versendet.
 */
export function vaOffeneMeldungen(
  vortraege: readonly VortragAuswaerts[],
  persons: readonly Person[],
  confirmations: ConfirmationMap,
  sentLog: SentLog,
  heute = new Date(),
): OffeneMeldung[] {
  const namen = new Map(persons.map((p) => [p.id, displayName(p)]))
  const zeilen = vortraege.map((v) => ({ id: v.id, datum: v.datum, zeit: v.zeit, versammlung: v.versammlung, person_id: v.pid }))
  return nochNichtGemeldet(
    offeneVortraegeAuswaerts(zeilen, namen, new Map(Object.entries(confirmations)), kalendertagMs(heute)),
    sentLog,
  )
}

/** Wann ging zuletzt etwas über Vorträge auswärts hinaus? */
export function vaZuletztGesendet(sentLog: SentLog): string | null {
  return neuesterVersand(sentLog, (schluessel) => schluessel.startsWith('va|'))
}

/**
 * **Bestätigte** Vorträge, die einem Redner genommen wurden — gestrichen oder
 * an einen anderen gegeben. Er erfährt es sofort, wie bei jedem anderen Platz.
 * Vergangenes nicht, und niemand, den es nicht mehr gibt.
 */
export function vaEntzogeneZusagen(
  vorher: readonly VortragAuswaerts[],
  nachher: readonly VortragAuswaerts[],
  persons: readonly Person[],
  confirmations: ConfirmationMap,
  heute = new Date(),
): EntzogeneZusage[] {
  if (vorher === nachher) return []
  const jetzt = new Map(nachher.map((v) => [v.id, v]))
  const out: EntzogeneZusage[] = []
  for (const v of vorher) {
    if (!v.pid || jetzt.get(v.id)?.pid === v.pid) continue
    const key = vaTaskKey(v)
    if ((confirmations ?? {})[key] !== 'bestätigt' || vaVorbei(v, heute)) continue
    const person = persons.find((p) => p.id === v.pid)
    if (!person) continue
    out.push({ key, name: displayName(person), pid: v.pid, label: VA_ROLLE, datum: vaTerminText(v) })
  }
  return out
}

/**
 * Zusagen, die mit dieser Änderung verfallen: Der Vortrag ist weg oder hat einen
 * anderen Redner. Der Schlüssel trägt keine Person — ohne das Abräumen erbte
 * der neue Redner die Zusage des alten (dieselbe Falle wie beim
 * Treffpunkt-Leiter).
 */
export function vaVerwaisteZusagen(
  vorher: readonly VortragAuswaerts[],
  nachher: readonly VortragAuswaerts[],
): string[] {
  if (vorher === nachher) return []
  const jetzt = new Map(nachher.map((v) => [v.id, v]))
  return vorher.filter((v) => jetzt.get(v.id)?.pid !== v.pid).map(vaTaskKey)
}

/** Was die Planungs-Karte auf Start zu den Vorträgen auswärts nennt. */
export interface VaStand {
  konflikte: number
  /** Kommende Vorträge ohne Redner. */
  offen: number
  nichtGesendet: number
}

/** Der Stand für die Planungs-Karte — dieselben Zahlen wie die Banner beim Planen. */
export function vaStand(args: {
  vortraege: readonly VortragAuswaerts[]
  weeks: readonly Week[]
  persons: readonly Person[]
  absences: readonly Absence[]
  services: Service[]
  zeiten: MeetingTimes
  confirmations: ConfirmationMap
  sentLog: SentLog
  sendenMoeglich: boolean
  heute?: Date
}): VaStand {
  const { vortraege, confirmations, sentLog, sendenMoeglich, persons, heute = new Date() } = args
  if (vortraege.length === 0) return { konflikte: 0, offen: 0, nichtGesendet: 0 }
  return {
    konflikte: vaKonflikte({ ...args, heute }).length,
    offen: vortraege.filter((v) => !v.pid && !vaVorbei(v, heute)).length,
    nichtGesendet: sendenMoeglich ? vaOffeneMeldungen(vortraege, persons, confirmations, sentLog, heute).length : 0,
  }
}
