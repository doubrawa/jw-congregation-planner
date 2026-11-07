/**
 * Was mehrere Teile des Reducers brauchen: Toasts, Mitteilungen, das Abräumen
 * von Zusagen, die Kennungen der Wochen und der Sprung zur nächsten
 * Zusammenkunft. Keine Aktionen.
 */

import { naechsteZusammenkunft } from '../../data/meeting-dates'
import { dict, type Dict } from '../../i18n/ui'
import { fill } from '../../i18n/useT'
import type { ConfirmationMap, MeetingTab, Notification, NotificationType } from '../../data/types'
import type { AppState } from '../context'

/** Nächster Toast (id erzwingt Timer-/Animations-Neustart bei gleichem Text). */
export function nextToast(state: AppState, text: string): AppState['toast'] {
  return { id: (state.toast?.id ?? 0) + 1, text }
}

/** Toast aus einem übersetzten UI-Schlüssel (Reducer kennt state.lang). */
export function toastKey(
  state: AppState,
  key: keyof Dict,
  params?: Record<string, string | number>,
): AppState['toast'] {
  return nextToast(state, fill(dict(state.lang)[key], params ?? {}))
}

export function makeNotif(
  type: NotificationType,
  title: string,
  text: string,
  taskId?: string,
): Notification {
  // `local`: hier entstanden, also noch zu verteilen (siehe persist.ts).
  return { id: crypto.randomUUID(), type, title, text, at: new Date().toISOString(), read: false, taskId, local: true }
}

/** Neue Mitteilung vorne anfügen. */
export function pushNotif(
  notifs: Notification[],
  type: NotificationType,
  title: string,
  text: string,
): Notification[] {
  return [makeNotif(type, title, text), ...notifs]
}

/*
 * **Ein Zuteilungsklick schreibt keine Mitteilung an die Planer**, aus zwei
 * Gründen. Erstens ginge sie an den Falschen: Die eingeteilte Person erführe
 * nichts, der Planer bekäme die Meldung über seine eigene Handlung, die er als
 * Toast gerade quittiert hat. Zweitens wäre es zu viel — eine Woche hat gut 35
 * Plätze, von Hand geteilt also 35 Zeilen in der Glocke jedes Planers; das
 * Ladefenster von 50 wäre nach anderthalb Wochen voll und verdrängte alles
 * andere, die eigenen Erinnerungen eingeschlossen.
 *
 * Bescheid gibt „Plan senden" (`PlanSendenBlatt` → Edge Function
 * `send-plan`): eine Nachricht je **eingeteilter Person**, wenn der Plan steht.
 * Was der Planer über den Stand seiner Woche wissen muss, steht ohnehin im
 * Planen-Screen — Konflikte, offene Plätze, Engpässe und die Lage jedes
 * besetzten Platzes. Dafür braucht es keine Nachricht.
 */

/** Bestätigungs-Status der angegebenen Slots aus der Map entfernen. */
export function dropConfirmations(map: ConfirmationMap, keys: string[]): ConfirmationMap {
  if (keys.length === 0 || keys.every((k) => !(k in map))) return map
  const next = { ...map }
  for (const k of keys) delete next[k]
  return next
}

/**
 * Die Kennungen der geladenen Wochen (ihre Montage) — die Treffpunkt-
 * Wochen liegen parallel dazu und werden darüber materialisiert.
 */
export function wochenKennungen(state: Pick<AppState, 'weeks'>): string[] {
  return state.weeks.map((w) => w.start)
}

/**
 * Die Reiter, von denen ein stilles Nachladen auf die nächste Zusammenkunft
 * springen darf: die beiden Zusammenkünfte und ihr Bearbeiten. Alle übrigen —
 * Treffpunkte, Weitere Pläne — bleiben stehen.
 *
 * **Positiv aufgezählt.** Ein neuer Reiter ist von selbst geschützt; wer ihn
 * springen lassen will, muss es hier sagen. In einer Gegenliste müsste sich
 * jeder neue Reiter selbst eintragen.
 */
const NACHLADEN_DARF_SPRINGEN: ReadonlySet<MeetingTab> = new Set<MeetingTab>(['mid', 'we', 'edit'])

/**
 * Woche und Reiter auf die nächste Zusammenkunft setzen — es sei denn,
 * der Nutzer hat in dieser Sitzung schon selbst gewählt.
 *
 * Gibt es keine nächste (keine Wochen geladen, alle Termine vorbei), bleibt
 * alles stehen: eine Ansicht auf gut Glück zu verschieben wäre schlechter als
 * die, auf der man ist.
 *
 * Die Treffpunkte bleiben unangetastet: Wer im Predigtdienst ist, meint ihn und
 * keine Zusammenkunft. Das Menü führt ohne eigene Wahl dorthin; sonst würfe
 * das Nachladen (etwa nach „Plan senden") mitten in der Arbeit in die
 * Zusammenkünfte. Ebenso die Weiteren Pläne, zu denen das Menü ohne Wahl
 * führt.
 */
export function zurNaechstenZusammenkunft(state: AppState): AppState {
  if (state.terminGewaehlt || !NACHLADEN_DARF_SPRINGEN.has(state.tab)) return state
  const naechste = naechsteZusammenkunft(state.weeks, state.congregation.times)
  return naechste ? { ...state, week: naechste.wi, tab: naechste.tab } : state
}
