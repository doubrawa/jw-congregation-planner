import type { Person } from '../data/types'

/**
 * Die Person hinter dem angemeldeten Konto — `undefined`, wenn keine verknüpft
 * ist (ein Konto, dessen Einladung ohne Person kam, oder die Entwicklerseite
 * ohne `me=`).
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

/**
 * Ist jemand mit einem Konto angemeldet? Danach richten sich die
 * Konto-Funktionen — Konto-Karte, „Alle einladen", Push: Ohne Konto gibt es
 * niemanden, der einlädt, und kein Abo, an das eine Nachricht ginge.
 *
 * Bis zum 2.10.2026 stand dieselbe Frage dreimal als „nicht im Demo-Modus" da.
 * Im Betrieb ist ohne Konto nur die Anmeldemaske zu sehen; was dahinter ohne
 * Konto läuft, ist allein die Entwicklerseite.
 */
export function istAngemeldet(state: { userId: string | null }): boolean {
  return state.userId !== null
}
