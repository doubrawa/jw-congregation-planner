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
 *  - er ein leerer **Hilfsdienst** ist (25.10.2026, Betreiber: „freie plätze
 *    dürfen nur hilfsdienste betreffen. aufgaben weist der planer zu") — bis
 *    dahin auch Programmpunkte und der Ratgeber, ohne Redner- und
 *    Schulungsplätze;
 *  - der Leser den Aufgabenbereich hat und an dem Tag nicht abwesend ist.
 *
 * Übernommen wird **direkt**, ohne Rückfrage beim Planer — wie beim
 * Einspringen. Dieselben Regeln prüft der Server (Edge Function `substitute`,
 * Aufruf 'fill', `fuellen.ts`); ein Knopf ist keine Rechteprüfung.
 */

import { istAbwesend, KEINE_ABWESENHEIT, type AbsenceSet } from './absence'
import { isQualified, istAusgefallen, MEETING_TABS } from './helpers'
import { angebotsBereich } from '../../supabase/functions/_shared/freie-plaetze.ts'
import { istVorbei, meetingDateMs, meetingDateText } from './meeting-dates'
import { allePlaetze, platzKey } from './plaetze'
import { assignmentsInMeeting, wochenIndex } from './planning'
import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
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
  /** Leer: Ein Hilfsdienst trägt sich über seinen Namen (`rolle`), wie bei den Aufgaben. */
  title: string
  /** Der Name des Dienstes, **App-Sprache** (wie `MyTask.rolle`). */
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
  return gesendeteWochen(sentLog).has(woche)
}

/**
 * **Die Wochen, deren Plan der Zusammenkünfte hinausging** — der Montag vor dem
 * ersten `|` jedes Schlüssels, ohne die Treffpunkte (`fs|…`). Ein Durchlauf
 * über das Tagebuch für alle Wochen: `offenePlaetze` fragte bis zum 16.10.2026
 * je Woche einzeln, 52 Mal über bis zu 3120 Einträge — 41 bis 112 ms bei jeder
 * Ableitung, also bei jeder Zuteilung.
 */
export function gesendeteWochen(sentLog: SentLog): Set<string> {
  const out = new Set<string>()
  for (const schluessel of Object.keys(sentLog)) {
    // Das erste Feld ist der Montag (`<montag>|…`). Bei den Treffpunkten
    // (`fs|<montag>|…`, `wochenPraefixe`) ist es `fs` — sie geben die Woche nicht frei.
    const ende = schluessel.indexOf('|')
    const woche = ende > 0 ? schluessel.slice(0, ende) : ''
    if (woche && woche !== 'fs') out.add(woche)
  }
  return out
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
  const gesendet = gesendeteWochen(sentLog)
  weeks.forEach((week, wi) => {
    if (!gesendet.has(week.start)) return
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      const at = meetingDateMs(week, tab, zeiten)
      if (istVorbei(at, heute)) continue
      if (istAbwesend(abwesend, me.id, wi, tab)) continue
      const meeting = week[tab]
      for (const platz of allePlaetze(meeting, services)) {
        // Nur Hilfsdienste — Programmpunkte und den Ratgeber teilt der Planer zu.
        if (platz.art !== 'helper') continue
        if (platz.slot?.name) continue
        const bereich = angebotsBereich(platz.svc)
        if (!bereich || !isQualified(me, bereich)) continue
        out.push({
          key: platzKey(platz, week.start, tab),
          // Wie bei den Aufgaben (`eachAssignedSlot`): Der Dienst trägt allein.
          title: '',
          rolle: platz.svc.name,
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
