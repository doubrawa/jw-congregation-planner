/**
 * **Die Zusagen einer Woche** (T121, Phase 5g, Entwürfe `GRueckmeldungen` und
 * `GDesktopZusagen`) — reine Logik.
 *
 * Nach „Plan senden" will der Planer wissen, wo die Woche steht: Was ist zu
 * klären (abgesagt, abwesend, doppelt eingeteilt), wer hat noch nicht
 * zugesagt, wer schon. Jeder Platz steht dabei in **derselben Lage wie im
 * Plan** (`lageVon`): rot, blass, voll. Eine eigene Einteilung hier nennte über
 * kurz oder lang einen Platz „zugesagt", den der Plan rot zeigt.
 *
 * Gezählt werden die Plätze, die etwas zu bestätigen haben — dieselbe
 * Aufzählung wie bei den eigenen Aufgaben und bei „Plan senden"
 * (`eachAssignedSlot`): keine Gastredner, keine Gruppen-Dienste, nichts aus
 * einer ausgefallenen Zusammenkunft. Was vorbei ist, fehlt: Danach zählt keine
 * Zusage mehr, und niemand wird mehr erinnert.
 */

import { vergangeneZusammenkuenfte } from './plan-versand'
import { eachAssignedSlot, sentKey, zusageStatus, type Conflict } from './planning'
import { lageVon, type PlatzLage } from './saal'
import type { ConfirmationMap, MeetingKey, MeetingTimes, MyTask, SentLog, Service, SlotAssignment, Week } from './types'

/** Ein besetzter Platz der Woche, so wie die Zusagen ihn zeigen. */
export interface ZusagePlatz {
  /** Aufgaben-Schlüssel — derselbe wie in `confirmations` und im Versand-Tagebuch. */
  key: string
  tab: MeetingKey
  slot: SlotAssignment
  /** Wie im Plan: Problem, wartet oder zugesagt. Offen ist ein besetzter Platz nie. */
  lage: Exclude<PlatzLage, 'offen'>
  /** Der Konflikt, in dem die Zuteilung steht — er nennt den Grund eines Problems. */
  konflikt?: Conflict
  /** Ein Hilfsdienst: Nach einer Absage sucht die App dort selbst Ersatz (`declineTask`). */
  hilfsdienst: boolean
  /** Wann die Nachricht hinausging (Versand-Tagebuch) — `null`: noch nicht gesendet. */
  gesendet: string | null
  /** Die Aufgabe, wie „Meine Aufgaben" sie zeigt — erst auf Abruf. */
  aufgabe: () => MyTask
}

/**
 * Jeder besetzte Platz beider Zusammenkünfte einer Woche, der etwas zu
 * bestätigen hat, mit seiner Lage. `konfliktVon` ist dieselbe Frage wie im
 * Plan (`machKonfliktVon` je Zusammenkunft); `heute` sagt, was vorbei ist.
 */
export function zusagenDerWoche(args: {
  week: Week
  services: Service[]
  confirmations: ConfirmationMap
  sentLog: SentLog
  zeiten: MeetingTimes
  konfliktVon: (tab: MeetingKey, slot: SlotAssignment) => Conflict | undefined
  heute: Date
}): ZusagePlatz[] {
  const { week, services, confirmations, sentLog, zeiten, konfliktVon, heute } = args
  const vorbei = vergangeneZusammenkuenfte(week, zeiten, heute)
  const out: ZusagePlatz[] = []
  eachAssignedSlot([week], services, zeiten, (slot, key, aufgabe, { tab, platz }) => {
    if (vorbei.has(tab)) return
    const konflikt = konfliktVon(tab, slot)
    const lage = lageVon(slot, zusageStatus(confirmations, key), konflikt !== undefined)
    if (lage === 'offen') return
    out.push({
      key,
      tab,
      slot,
      lage,
      ...(konflikt ? { konflikt } : {}),
      hilfsdienst: platz.art === 'helper',
      gesendet: sentLog[sentKey(key, slot.name)] ?? null,
      aufgabe,
    })
  })
  return out
}
