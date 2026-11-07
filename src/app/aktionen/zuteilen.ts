/**
 * Plätze der Zusammenkünfte besetzen: von Hand (über dasselbe Blatt auch die
 * Leitung eines Treffpunkts), automatisch oder leeren, dazu den Vortragsplan
 * übernehmen. Wechselt ein Platz den Inhaber, verfällt seine Zusage.
 */

import { abwesenheitenVon } from '../../data/absence'
import { fsSetLeader } from '../../data/fs'
import { mtab } from '../../data/helpers'
import { vortragsplanAnwenden, vortragsplanVorschau } from '../../data/vortragsplan'
import { autoAssignMeeting, clearAssignments, tabsImUmfang, type Umfang } from '../../data/planung/automatik'
import { assignSlot, changedSlotKeys } from '../../data/planung/zuteilen'
import type { MeetingKey, Week } from '../../data/types'
import type { AppAction, AppState } from '../context'
import { dropConfirmations, toastKey } from './gemeinsam'

/**
 * Schlüssel der Slots, die sich zwischen zwei Wochenständen geändert haben —
 * und eine leere Liste, wenn es die Zusammenkunft an dieser Stelle nicht gibt.
 * Nichts zu vergleichen heißt nichts abzuräumen.
 */
function geaenderteSlots(
  vorher: Week[],
  nachher: Week[],
  wi: number,
  tab: MeetingKey,
  services: AppState['services'],
): string[] {
  const a = vorher[wi]?.[tab]
  const b = nachher[wi]?.[tab]
  // Die Kennung kommt aus der Woche selbst — der Index taugt dafuer nicht.
  const woche = nachher[wi]?.start ?? ''
  return a && b ? changedSlotKeys(a, b, services, woche, tab) : []
}

/** Die Zusammenkünfte, auf die „Automatisch" und „Leeren" wirken (`tabsImUmfang`). */
function umfangTabs(state: AppState, umfang: Umfang = 'tag'): MeetingKey[] {
  return tabsImUmfang(state.weeks[state.week], mtab(state.tab), umfang)
}

/** Die geänderten Plätze aller Zusammenkünfte des Umfangs — deren Zusagen verfallen. */
function geaenderteSlotsIm(state: AppState, nachher: Week[], umfang: Umfang | undefined): string[] {
  return umfangTabs(state, umfang).flatMap((tab) => geaenderteSlots(state.weeks, nachher, state.week, tab, state.services))
}

type ZuteilenAktion = Extract<
  AppAction,
  {
    type:
      | 'assign'
      | 'autoAssign'
      | 'clearAssignments'
      | 'vortragsplanUebernehmen'
  }
>

export function zuteilen(state: AppState, action: ZuteilenAktion): AppState {
  switch (action.type) {
    case 'assign': {
      // Zuteilen bzw. Entfernen ("") (Prototyp: assignTo)
      const sel = state.slotSel
      if (!sel) return state
      // Treffpunkt-Leiter: eigene Datenquelle (fsWeeks). Die Zusage des
      // Vorgängers räumt `ohneVerwaisteTreffpunktZusagen` ab.
      if (sel.kind === 'fs') {
        const fsWeeks = fsSetLeader(
          state.fsWeeks,
          sel.wi,
          sel.instId,
          action.name,
          action.pid,
          action.extern,
        )
        return {
          ...state,
          fsWeeks,
          slotSel: null,
          toast: action.name ? toastKey(state, 'toastZugeteilt') : toastKey(state, 'toastEntfernt'),
        }
      }
      const weeks = assignSlot(state.weeks, sel, action.name, action.rolle, action.pid, action.herkunft)
      return {
        ...state,
        weeks,
        // Geänderte Slots: alten Bestätigungs-Status abräumen (sonst erbt die
        // neue Person ein fremdes „bestätigt“/„verhindert“).
        //
        // Wer hier einen Platz verliert, von dem er wusste (zugesagt oder
        // gemeldet), erfährt es sofort — persist.ts liest das aus dem
        // Vorher/Nachher-Vergleich und ruft `send-plan` mit 'entzug'.
        confirmations: dropConfirmations(
          state.confirmations,
          geaenderteSlots(state.weeks, weeks, sel.wi, sel.tab, state.services),
        ),
        slotSel: null,
        toast: action.name ? toastKey(state, 'toastZugeteilt') : toastKey(state, 'toastEntfernt'),
      }
    }
    case 'autoAssign': {
      if (!state.weeks[state.week]) return state // keine Wochen geladen
      const abwesend = abwesenheitenVon(state.absences, state.weeks, state.congregation.times)
      // Nacheinander, nicht nebeneinander: Die zweite Zusammenkunft sieht, wen
      // die erste schon eingeteilt hat — die Auslastung zählt sie mit.
      let weeks = state.weeks
      let count = 0
      let unfilled = 0
      for (const tab of umfangTabs(state, action.umfang)) {
        const r = autoAssignMeeting(weeks, state.week, tab, state.persons, state.services, state.groups, action.scope, abwesend)
        weeks = r.weeks
        count += r.count
        unfilled += r.unfilled
      }
      if (count === 0) {
        // Offen gebliebene, aber nicht besetzbare Slots (keine passende/freie
        // Person) klar von „nichts offen“ unterscheiden.
        const key = unfilled > 0 ? 'toastKeinePassende' : 'toastKeineOffen'
        return { ...state, toast: toastKey(state, key) }
      }
      return {
        ...state,
        weeks,
        confirmations: dropConfirmations(state.confirmations, geaenderteSlotsIm(state, weeks, action.umfang)),
        toast: toastKey(state, 'toastAutoN', { n: count }),
      }
    }
    case 'clearAssignments': {
      if (!state.weeks[state.week]) return state // keine Wochen geladen
      let weeks = state.weeks
      let count = 0
      for (const tab of umfangTabs(state, action.umfang)) {
        const r = clearAssignments(weeks, state.week, tab, action.scope)
        weeks = r.weeks
        count += r.count
      }
      if (count === 0) return { ...state, toast: toastKey(state, 'toastGeleertN', { n: 0 }) }
      return {
        ...state,
        weeks,
        confirmations: dropConfirmations(state.confirmations, geaenderteSlotsIm(state, weeks, action.umfang)),
        toast: toastKey(state, 'toastGeleertN', { n: count }),
      }
    }
    case 'vortragsplanUebernehmen': {
      // Neu gerechnet mit dem Stand von jetzt — die Vorschau kann ein anderer
      // Planer inzwischen überholt haben (`data/vortragsplan.ts`).
      const heute = new Date()
      const vorschau = vortragsplanVorschau(action.plan, {
        weeks: state.weeks,
        vormerkungen: state.vortraege,
        persons: state.persons,
        zeiten: state.congregation.times,
        heute,
      })
      const { weeks, vormerkungen, geaendert } = vortragsplanAnwenden({
        vorschau,
        weeks: state.weeks,
        vormerkungen: state.vortraege,
        neueId: () => `v${crypto.randomUUID()}`,
        heute,
      })
      return {
        ...state,
        weeks,
        vortraege: vormerkungen,
        // Wie beim Zuteilen von Hand: Wer seinen Vortrag verliert, verliert die
        // Zusage — und erfährt es (`persist.ts`, Entzug).
        confirmations: dropConfirmations(
          state.confirmations,
          geaendert.flatMap((wi) => geaenderteSlots(state.weeks, weeks, wi, 'we', state.services)),
        ),
        toast: toastKey(state, 'toastVortraegeUebernommen'),
      }
    }
  }
}
