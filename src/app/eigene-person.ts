import type { Person } from '../data/types'

/**
 * Die Person hinter dem angemeldeten Konto — `undefined`, wenn keine verknüpft
 * ist (Demo, oder ein Konto, dessen Einladung ohne Person kam).
 *
 * Die Suche stand neunmal ausgeschrieben da, in Bildschirmen wie im Reducer.
 * Sie ist die Stelle, an der „ich" entsteht: Wer sie ändert (etwa auf einen
 * Index statt einer Suche), soll das einmal tun.
 */
export function eigenePerson(state: {
  persons: readonly Person[]
  personId: string | null
}): Person | undefined {
  return state.personId ? state.persons.find((p) => p.id === state.personId) : undefined
}
