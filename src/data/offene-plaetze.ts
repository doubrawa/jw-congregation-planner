/**
 * **Offene Plätze, die man selbst übernehmen kann** (4.10.2026).
 *
 * „Wo sieht man in der App, welche Zuteilungen noch frei sind, bei denen ich
 * einspringen könnte, weil ich auch diesen Aufgabenbereich machen darf?" Bis
 * dahin nirgends: Das Einspringen bot nur Hilfsdienste an, die jemand abgesagt
 * hatte. Ein Platz, den der Planer nie besetzt hatte, blieb leer, bis er es
 * selbst bemerkte.
 *
 * Angeboten wird ein Platz (Zuschnitt des Betreibers, 4.10.2026), wenn
 *  - der Plan seiner Woche gesendet ist — vorher plant der Planer noch, und ein
 *    leerer Platz hieße nichts;
 *  - seine Zusammenkunft noch kommt und nicht ausfällt;
 *  - er leer ist und weder ein Rednerplatz noch eine Schulungsaufgabe — die
 *    teilt der Aufseher bewusst zu (Lektion, Partner, Raum);
 *  - der Leser den Aufgabenbereich hat (ein Brüder-Platz: ein Bruder ist), an
 *    dem Tag nicht abwesend ist und im selben Programmpunkt nicht schon steht.
 *
 * Übernommen wird **direkt**, ohne Rückfrage beim Planer — wie beim
 * Einspringen. Dieselben Regeln prüft der Server (Edge Function `substitute`,
 * Aufruf 'fill', `fuellen.ts`); ein Knopf ist keine Rechteprüfung.
 */

import { istAbwesend, KEINE_ABWESENHEIT, type AbsenceSet } from './absence'
import { RATGEBER_ROLLE } from './aux-class'
import {
  gehoertZu,
  isQualified,
  istAusgefallen,
  istBlockSektion,
  MEETING_TABS,
  rolleMitHerkunft,
  serviceQualKey,
  slotsOf,
} from './helpers'
import { programmAngebot } from '../../supabase/functions/_shared/freie-plaetze.ts'
import { istVorbei, meetingDateMs, meetingDateText } from './meeting-dates'
import { allePlaetze, platzKey, type Platz } from './plaetze'
import { neuesterVersand } from './plan-versand'
import { assignmentsInMeeting, wochenIndex } from './planning'
import { schluesselTeile, wochenPraefixe } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import type {
  MeetingAssignment,
  MeetingSlotSelection,
  MeetingTimes,
  Person,
  SentLog,
  Service,
  Week,
} from './types'

/** Ein Platz, den der Leser übernehmen kann — wie eine Aufgabe beschriftet. */
export interface OffenerPlatz {
  /** Der `task_key` des Platzes — damit übernimmt ihn der Server. */
  key: string
  /** Programmpunkt, **Versammlungssprache**; leer, wo die Rolle allein trägt. */
  title: string
  /** Rolle oder Dienstname, **App-Sprache** (wie `MyTask.rolle`). */
  rolle?: string
  date: string
  /** UTC-Mitternacht des Zusammenkunftstags — Countdown und Reihenfolge. */
  at: number | null
  /** Was der Leser an dem Tag schon hat — vor dem Übernehmen, nicht danach. */
  schonHeute: MeetingAssignment[]
  /** Wie `MyTask.lesersprache`: Titel und Datum in der Sprache des Lesers. */
  lesersprache?: true
}

/**
 * Ist der Plan der Zusammenkünfte dieser Woche hinausgegangen („Plan senden")?
 *
 * Nur die Schlüssel der Zusammenkünfte zählen (`<montag>|…`), nicht die der
 * Treffpunkte (`fs|<montag>|…`): Die sendet auch der Gruppenaufseher, und
 * daraus folgt nichts für das Programm.
 */
export function planGesendet(sentLog: SentLog, woche: string): boolean {
  const [zusammenkunft] = wochenPraefixe(woche)
  return neuesterVersand(sentLog, (schluessel) => schluessel.startsWith(zusammenkunft)) !== null
}

/**
 * Unter welchem Aufgabenbereich ein Platz angeboten wird — `null`: gar nicht.
 *
 * Die Regel für Programmpunkt und Ratgeber steht im geteilten Edge-Ordner
 * (`programmAngebot`): Rednerplätze nicht, Schulungsaufgaben nicht. Dieselbe
 * Prüfung macht der Server beim Eintragen. Bei den Hilfsdiensten fällt nur die
 * Reinigung heraus — eine Gruppe, keine Person.
 */
export function angebotsBereich(platz: Platz): string | null {
  if (platz.art === 'helper') return platz.svc.groups ? null : serviceQualKey(platz.svc.key)
  return programmAngebot(platz.slot)
}

/** Titel und Rolle eines Platzes — dieselbe Teilung wie bei den Aufgaben (`eachAssignedSlot`). */
function beschriftung(platz: Platz): Pick<OffenerPlatz, 'title' | 'rolle'> {
  if (platz.art === 'ratgeber') return { title: '', rolle: RATGEBER_ROLLE }
  if (platz.art === 'helper') return { title: '', rolle: platz.svc.name }
  const rolle = rolleMitHerkunft(platz.slot) ?? ''
  return {
    title: rolle && istBlockSektion(platz.section) ? '' : platz.item.title,
    ...(rolle ? { rolle } : {}),
  }
}

/**
 * Die offenen Plätze, die `me` übernehmen kann — nächste zuerst.
 *
 * `heute` steht als Parameter da, damit Tests und Entwicklerseite eine Uhr
 * vorgeben können; im Betrieb ist es jetzt.
 */
export function offenePlaetze(
  weeks: readonly Week[],
  services: Service[],
  sentLog: SentLog,
  me: Person,
  zeiten: MeetingTimes,
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
  heute = new Date(),
): OffenerPlatz[] {
  const out: OffenerPlatz[] = []
  weeks.forEach((week, wi) => {
    if (!planGesendet(sentLog, week.start)) return
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      const at = meetingDateMs(week, tab, zeiten)
      if (istVorbei(at, heute)) continue
      if (istAbwesend(abwesend, me.id, wi, tab)) continue
      const meeting = week[tab]
      for (const platz of allePlaetze(meeting, services)) {
        if (platz.slot?.name) continue
        const bereich = angebotsBereich(platz)
        if (!bereich || !isQualified(me, bereich)) continue
        if (platz.art !== 'helper' && platz.slot.male && me.female) continue
        // Im selben Programmpunkt schon eingeteilt (Leiter des Studiums, und
        // der Leser fehlt): Das übernimmt man nicht zusätzlich.
        if (platz.art === 'programm' && slotsOf(platz.item, platz.aux).some((s) => gehoertZu(s, me))) continue
        out.push({
          key: platzKey(platz, week.start, tab),
          ...beschriftung(platz),
          date: meetingDateText(week, tab, zeiten),
          at,
          schonHeute: assignmentsInMeeting(meeting, me, services),
        })
      }
    }
  })
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
}

/**
 * Die Auswahl (wie im Zuteilungs-Sheet) zu einem `task_key` — damit trägt der
 * Reducer den Übernehmenden genauso ein wie der Planer (`assignSlot`).
 *
 * Gesucht wird über denselben Durchlauf, aus dem der Schlüssel entstand
 * (`allePlaetze` + `platzKey`), statt den Schlüssel nachzubauen: Der Punkt
 * steht im Schlüssel über seine Kennung, das Sheet braucht seine Stelle.
 * `null`, wenn es den Platz nicht (mehr) gibt.
 */
export function platzAuswahl(
  weeks: readonly Week[],
  services: Service[],
  key: string,
): MeetingSlotSelection | null {
  const teile = schluesselTeile(key)
  if (!teile || !('tab' in teile)) return null
  const wi = wochenIndex(weeks, teile.woche)
  const meeting = weeks[wi]?.[teile.tab]
  if (!meeting) return null
  for (const platz of allePlaetze(meeting, services)) {
    if (platzKey(platz, teile.woche, teile.tab) !== key) continue
    const basis = { wi, tab: teile.tab, label: '', priv: null, groups: false }
    if (platz.art === 'ratgeber') return { kind: 'ratgeber', ...basis }
    if (platz.art === 'helper') return { kind: 'helper', ...basis, svc: platz.svc.key, pos: platz.pos }
    return { kind: 'part', ...basis, si: platz.si, ii: platz.ii, ni: platz.ni, ...(platz.aux ? { aux: true } : {}) }
  }
  return null
}
