/**
 * Weitere Pläne: Pläne anlegen, ändern und löschen, ihre
 * Wochen reihum an die Gruppen verteilen oder einzeln belegen.
 */

import {
  eintraegeImZeitraum,
  eintragSetzen,
  gruppenVerteilen,
  planNachDatum,
  taktVon,
  taktWechseln,
} from '../../data/weitere-plaene'
import type { AppAction, AppState } from '../context'
import { toastKey } from './gemeinsam'

/** Eine neue Kennung für einen Eintrag eines Weiteren Plans — eindeutig und lesbar, wie bei den Besuchen. */
function neueEintragId(): string {
  return `e${crypto.randomUUID()}`
}

type PlaeneAktion = Extract<
  AppAction,
  {
    type:
      | 'wpPlanAnlegen'
      | 'wpPlanAendern'
      | 'wpPlanLoeschen'
      | 'wpGruppenVerteilen'
      | 'wpEintragSetzen'
  }
>

export function plaene(state: AppState, action: PlaeneAktion): AppState {
  switch (action.type) {
    /*
     * Weitere Pläne — Ankündigungen: Hier verfällt keine
     * Zusage und geht keine Nachricht hinaus.
     */
    case 'wpPlanAnlegen':
      if (state.plaene.some((p) => p.id === action.plan.id)) return state
      return { ...state, plaene: planNachDatum([...state.plaene, action.plan]) }
    case 'wpPlanAendern': {
      const alt = state.plaene.find((p) => p.id === action.id)
      if (!alt) return state
      const plan = { ...alt, ...action.patch }
      // Ein Zeitraum, der vor seinem Anfang endet, ist keiner.
      if (plan.bis < plan.von) return state
      const veroeffentlicht = alt.entwurf && !plan.entwurf
      const zurueck = !alt.entwurf && plan.entwurf
      // Ein anderer Takt verteilt ab jetzt neu, in derselben Reihenfolge
      // (`taktWechseln`); ohne das gingen die Einträge unten alle, weil kein
      // Montag ein Monat ist.
      const wechsel =
        taktVon(plan) === taktVon(alt)
          ? null
          : taktWechseln({ plan, eintraege: state.planEintraege, groups: state.groups, heute: new Date(), neueId: neueEintragId })
      const meldung = veroeffentlicht
        ? toastKey(state, 'toastWpVeroeffentlicht')
        : zurueck
          ? toastKey(state, 'toastWpEntwurf')
          : wechsel?.verteilt
            ? toastKey(state, taktVon(plan) === 'monat' ? 'toastWpVerteiltMonate' : 'toastWpVerteilt', { n: wechsel.verteilt })
            : null
      return {
        ...state,
        plaene: planNachDatum(state.plaene.map((p) => (p === alt ? plan : p))),
        planEintraege: eintraegeImZeitraum(wechsel?.eintraege ?? state.planEintraege, plan),
        ...(meldung ? { toast: meldung } : {}),
      }
    }
    case 'wpPlanLoeschen':
      if (!state.plaene.some((p) => p.id === action.id)) return state
      return {
        ...state,
        plaene: state.plaene.filter((p) => p.id !== action.id),
        planEintraege: state.planEintraege.filter((e) => e.planId !== action.id),
        toast: toastKey(state, 'toastWpGeloescht'),
      }
    case 'wpGruppenVerteilen': {
      const plan = state.plaene.find((p) => p.id === action.planId)
      if (!plan) return state
      const { eintraege, verteilt } = gruppenVerteilen({
        plan,
        eintraege: state.planEintraege,
        groups: state.groups,
        abGruppe: action.abGruppe,
        heute: new Date(),
        neueId: neueEintragId,
      })
      const meldung = taktVon(plan) === 'monat' ? 'toastWpVerteiltMonate' : 'toastWpVerteilt'
      return { ...state, planEintraege: eintraege, toast: toastKey(state, meldung, { n: verteilt }) }
    }
    case 'wpEintragSetzen': {
      if (!state.plaene.some((p) => p.id === action.planId)) return state
      const eintraege = eintragSetzen({ ...action, eintraege: state.planEintraege, neueId: neueEintragId })
      return eintraege === state.planEintraege ? state : { ...state, planEintraege: eintraege }
    }
  }
}
