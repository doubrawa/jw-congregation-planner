import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { anwesenheitDer, darfAnwesenheit, type Anwesenheit } from '../data/anwesenheit'
import { displayName } from '../data/helpers'
import { rechteVon } from '../data/rechte'
import type { MeetingKey, Week } from '../data/types'

/** Wer eingetragen hat — der Name, oder leer, wenn die Person fehlt. */
export function eingetragenVon(a: Anwesenheit | undefined, persons: readonly { id: string; fn: string; ln: string }[]): string {
  const p = a?.pid ? persons.find((x) => x.id === a.pid) : undefined
  return p ? displayName(p) : ''
}

/**
 * Die Anwesenden einer Zusammenkunft und ob der Leser sie eintragen darf —
 * für das Programm, den Start und die Auswertung (T152).
 */
export function useAnwesenheit(week: Week | undefined, tab: MeetingKey): { eintrag: Anwesenheit | undefined; darf: boolean } {
  const { state } = useApp()
  if (!week) return { eintrag: undefined, darf: false }
  const me = eigenePerson(state)
  const ich = me ? { id: me.id, name: displayName(me) } : null
  // Offline (Momentaufnahme) geht nichts hinaus — dann bietet nichts das Eintragen an.
  const darf = state.staleAt === null && darfAnwesenheit(week, tab, ich, rechteVon(state).zuteilen)
  return { eintrag: anwesenheitDer(state.anwesenheit, week.start, tab), darf }
}
