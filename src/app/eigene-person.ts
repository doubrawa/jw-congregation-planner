import { rechteStufe, rechteVon } from '../data/rechte'
import type { Group, Person } from '../data/types'
import { RECHTE_STUFE_KEY } from '../i18n/ui'
import type { I18n } from '../i18n/useT'

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
 * **Wie sich das Konto nennt**: Rechte-Stufe und, wenn es eine hat, die Gruppe
 * der eigenen Person — „Admin", „Gruppe 1". Im Fuß des Menüs steht davor
 * „Profil", im Profil stehen sie unter dem Namen.
 *
 * Eine Stelle für beide: Der Fuß des Menüs nannte die Gruppe bis zum
 * 12.10.2026 unübersetzt („Gruppe 1" auch auf Englisch), das Profil nicht.
 */
export function rolleUndGruppe(
  state: {
    planner: boolean
    zuteiler: boolean
    groups: readonly Group[]
    persons: readonly Person[]
    personId: string | null
  },
  { t, tu }: Pick<I18n, 't' | 'tu'>,
): string[] {
  const rolle = t[RECHTE_STUFE_KEY[rechteStufe(rechteVon(state), state)]]
  const gruppe = state.groups.find((g) => g.id === eigenePerson(state)?.grp)
  return gruppe ? [rolle, tu(gruppe.name)] : [rolle]
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
