/**
 * Predigtdienst: die Treffpunkte der Woche und ihr Grundplan, die
 * Gruppenbesuche des Dienstaufsehers und die Trolleys samt Terminen.
 */

import { wirktAb } from '../../data/meeting-dates'
import {
  fsAddInst,
  fsAutoAssign,
  fsClear,
  fsRegelAussetzen,
  fsRemoveInst,
  fsUpdateInst,
  regenFsWeeks,
} from '../../data/fs'
import { besuchAustragen, besuchEintragen, besuchsLage, besuchStand, nachWoche } from '../../data/gruppenbesuche'
import { termineSortiert } from '../../data/trolleys'
import type { Dict } from '../../i18n/ui'
import type { FsInstance, FsRule } from '../../data/types'
import type { AppAction, AppState } from '../context'
import { toastKey, wochenKennungen } from './gemeinsam'

/** Der Toast nach einer Trolley-Aktion — was die Function `trolley` getan hat. */
const TROLLEY_TOAST: Record<NonNullable<Extract<AppAction, { type: 'trolleyTermin' }>['toast']>, keyof Dict> = {
  eingetragen: 'toastTrolleyEingetragen',
  dazu: 'toastTrolleyDazu',
  ausgetragen: 'toastTrolleyAusgetragen',
}

type PredigtdienstAktion = Extract<
  AppAction,
  {
    type:
      | 'fsAutoAssign'
      | 'fsClear'
      | 'fsInstUpdate'
      | 'fsInstRemove'
      | 'fsInstAdd'
      | 'fsRuleAdd'
      | 'fsRuleUpdate'
      | 'fsRuleRemove'
      | 'besuchHinzufuegen'
      | 'besuchEntfernen'
      | 'besuchAendern'
      | 'besuchBesucher'
      | 'besuchUebernehmen'
      | 'trolleyAnlegen'
      | 'trolleyAendern'
      | 'trolleyEntfernt'
      | 'trolleyTermin'
  }
>

export function predigtdienst(state: AppState, action: PredigtdienstAktion): AppState {
  switch (action.type) {
    case 'fsAutoAssign': {
      const { fsWeeks, count, unfilled } = fsAutoAssign(
        state.fsWeeks,
        state.week,
        state.persons,
        action.onlyGroup,
        state.absences,
        state.weeks[state.week]?.start ?? '',
        state.groups,
        state.weeks.map((w) => w.start),
      )
      // Wie bei den Zusammenkünften: Blieb etwas offen, weil niemand frei war,
      // ist das nicht „keine offenen" (16.10.2026).
      if (count === 0) {
        return { ...state, toast: toastKey(state, unfilled > 0 ? 'toastKeinePassende' : 'toastKeineOffen') }
      }
      return { ...state, fsWeeks, toast: toastKey(state, 'toastAutoN', { n: count }) }
    }
    case 'fsClear': {
      const { fsWeeks, count } = fsClear(state.fsWeeks, state.week, action.onlyGroup)
      return { ...state, fsWeeks, toast: toastKey(state, 'toastGeleertN', { n: count }) }
    }
    case 'fsInstUpdate':
      return { ...state, fsWeeks: fsUpdateInst(state.fsWeeks, action.wi, action.id, action.patch) }
    case 'fsInstRemove': {
      // Ein Treffpunkt aus dem Grundplan wird in seiner Regel für diese Woche
      // ausgesetzt — sonst baute `regenFsWeeks` ihn beim nächsten Laden neu.
      const ruleId = state.fsWeeks[action.wi]?.find((i) => i.id === action.id)?.ruleId
      const woche = state.weeks[action.wi]?.start
      return {
        ...state,
        fsRules: ruleId && woche ? fsRegelAussetzen(state.fsRules, ruleId, woche) : state.fsRules,
        fsWeeks: fsRemoveInst(state.fsWeeks, action.wi, action.id),
        toast: toastKey(state, 'toastFsDel'),
      }
    }
    case 'fsInstAdd':
      return {
        ...state,
        fsWeeks: fsAddInst(state.fsWeeks, state.week, action.inst),
        toast: toastKey(state, 'toastFsAdd'),
      }
    /*
     * Der Grundplan formt die Wochen **ab der laufenden** (`wirktAb`): Die davor
     * haben so stattgefunden, wie sie dastehen.
     */
    case 'fsRuleAdd': {
      const rule: FsRule = {
        // Eindeutig statt zeitgestempelt: `r${Date.now()}` vergab zwei Regeln
        // derselben Millisekunde dieselbe Id — und die Id steckt in jeder
        // Treffpunkt-Kennung (`<wi>|<ruleId>`) und darüber im Aufgaben-
        // Schlüssel. Zwei Regeln mit einer Id hießen zwei Treffpunkte mit einer
        // Bestätigung. `crypto.randomUUID` nutzt der Reducer für Mitteilungen
        // ohnehin; das Präfix hält die Kennung lesbar.
        id: `r${crypto.randomUUID()}`,
        ...action.rule,
      }
      const fsRules = [...state.fsRules, rule]
      return {
        ...state,
        fsRules,
        fsWeeks: regenFsWeeks(wochenKennungen(state), state.fsWeeks, fsRules, { ab: wirktAb() }),
        toast: toastKey(state, 'toastFsRuleAdd'),
      }
    }
    case 'fsRuleUpdate': {
      const fsRules = state.fsRules.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r))
      // Zeit und Ort gehen nur bei den Treffpunkten dieser Regel auf die Regel
      // zurück; die übrigen behalten, was ihre Woche hat (`regenFsWeeks`).
      const dieseRegel = (inst: FsInstance) => inst.ruleId === action.id
      return { ...state, fsRules, fsWeeks: regenFsWeeks(wochenKennungen(state), state.fsWeeks, fsRules, { zuruecksetzen: dieseRegel, ab: wirktAb() }) }
    }
    case 'fsRuleRemove': {
      const fsRules = state.fsRules.filter((r) => r.id !== action.id)
      return {
        ...state,
        fsRules,
        fsWeeks: regenFsWeeks(wochenKennungen(state), state.fsWeeks, fsRules, { ab: wirktAb() }),
        toast: toastKey(state, 'toastFsRuleDel'),
      }
    }
    /*
     * Gruppenbesuche des Dienstaufsehers (T120, Phase 2). Jede Änderung trägt
     * den Besucher in die geladenen Treffpunkte ein oder aus; Zusagen, die
     * dabei verfallen, räumt `ohneVerwaisteTreffpunktZusagen` ab, und wer eine
     * bestätigte verliert, erfährt es über `persist.ts` — wie bei jedem
     * anderen Leiterwechsel.
     */
    case 'besuchHinzufuegen': {
      // Dieselbe Gruppe in derselben Woche gibt es nur einmal (so auch die Datenbank).
      if (state.gruppenbesuche.some((b) => b.woche === action.woche && b.grp === action.grp)) return state
      // Wie die Regeln des Grundplans: eindeutig und lesbar (`fsRuleAdd`).
      const besuch = { id: `b${crypto.randomUUID()}`, woche: action.woche, grp: action.grp, pid: action.pid }
      return {
        ...state,
        gruppenbesuche: nachWoche([...state.gruppenbesuche, besuch]),
        fsWeeks: besuchEintragen(state.fsWeeks, wochenKennungen(state), besuch, state.persons),
        toast: toastKey(state, 'toastBesuchAdd'),
      }
    }
    case 'besuchEntfernen': {
      const besuch = state.gruppenbesuche.find((b) => b.id === action.id)
      if (!besuch) return state
      return {
        ...state,
        gruppenbesuche: state.gruppenbesuche.filter((b) => b !== besuch),
        fsWeeks: besuchAustragen(state.fsWeeks, wochenKennungen(state), besuch),
        toast: toastKey(state, 'toastBesuchDel'),
      }
    }
    case 'besuchAendern': {
      // Woche oder Gruppe eines Besuchs ändern (4.10.2026): Der Besucher geht
      // aus den Treffpunkten, die er bisher leitete, und tritt in die der neuen
      // Woche und Gruppe — wie beim Wechsel des Besuchers.
      const alt = state.gruppenbesuche.find((b) => b.id === action.id)
      if (!alt) return state
      const neu = { ...alt, ...action.patch }
      if (neu.woche === alt.woche && neu.grp === alt.grp) return state
      // Dieselbe Gruppe in derselben Woche gibt es nur einmal (so auch die Datenbank).
      if (state.gruppenbesuche.some((b) => b !== alt && b.woche === neu.woche && b.grp === neu.grp)) return state
      // Vergangenes bleibt als Rückblick, und dorthin verlegt wird auch nicht.
      const lage = besuchsLage(state)
      if (besuchStand(alt, lage).art === 'vorbei' || besuchStand(neu, lage).art === 'vorbei') return state
      const fsWeeks = besuchEintragen(besuchAustragen(state.fsWeeks, lage.kennungen, alt), lage.kennungen, neu, state.persons)
      return { ...state, gruppenbesuche: nachWoche(state.gruppenbesuche.map((b) => (b === alt ? neu : b))), fsWeeks }
    }
    case 'besuchBesucher': {
      const alt = state.gruppenbesuche.find((b) => b.id === action.id)
      if (!alt || alt.pid === action.pid) return state
      const neu = { ...alt, pid: action.pid }
      const kennungen = wochenKennungen(state)
      // Wo der bisherige Besucher eingetragen war, wird frei — und dort tritt
      // der neue an. Einen fremden Leiter ersetzt auch er nicht ungefragt.
      const fsWeeks = besuchEintragen(besuchAustragen(state.fsWeeks, kennungen, alt), kennungen, neu, state.persons)
      return { ...state, gruppenbesuche: state.gruppenbesuche.map((b) => (b === alt ? neu : b)), fsWeeks }
    }
    case 'besuchUebernehmen': {
      const besuch = state.gruppenbesuche.find((b) => b.id === action.id)
      if (!besuch) return state
      const fsWeeks = besuchEintragen(state.fsWeeks, wochenKennungen(state), besuch, state.persons, true)
      return fsWeeks === state.fsWeeks ? state : { ...state, fsWeeks, toast: toastKey(state, 'toastZugeteilt') }
    }
    /*
     * Trolleys (T121, Phase 7). Die Trolleys pflegt der Admin; Termine ändert
     * nur die Edge Function `trolley` — hier landet, was sie zurückgibt
     * (`trolleyTermin`). Entfernt wird ein Trolley erst nach ihr
     * (`trolleyEntfernt`): Sie hat ihn samt Terminen gelöscht und den
     * Eingetragenen Bescheid gesagt.
     */
    case 'trolleyAnlegen':
      if (state.trolleys.some((t) => t.id === action.trolley.id)) return state
      return { ...state, trolleys: [...state.trolleys, action.trolley] }
    case 'trolleyAendern': {
      const alt = state.trolleys.find((t) => t.id === action.id)
      // Ohne Namen ist es kein Trolley — die Datenbank weist ihn ab.
      if (!alt || action.patch.name?.trim() === '') return state
      return { ...state, trolleys: state.trolleys.map((t) => (t === alt ? { ...alt, ...action.patch } : t)) }
    }
    case 'trolleyEntfernt':
      if (!state.trolleys.some((t) => t.id === action.id)) return state
      return {
        ...state,
        trolleys: state.trolleys.filter((t) => t.id !== action.id),
        // Seine Termine gingen in der Datenbank per Kaskade mit.
        trolleyTermine: state.trolleyTermine.filter((t) => t.trolleyId !== action.id),
        toast: toastKey(state, 'toastTrolleyEntfernt'),
      }
    case 'trolleyTermin': {
      // Einen Termin räumen, den es hier nicht (mehr) gibt, ändert nichts.
      if (!action.termin && !state.trolleyTermine.some((t) => t.id === action.id)) return state
      const ohne = state.trolleyTermine.filter((t) => t.id !== action.id)
      return {
        ...state,
        trolleyTermine: action.termin ? termineSortiert([...ohne, action.termin]) : ohne,
        ...(action.toast ? { toast: toastKey(state, TROLLEY_TOAST[action.toast]) } : {}),
      }
    }
  }
}
