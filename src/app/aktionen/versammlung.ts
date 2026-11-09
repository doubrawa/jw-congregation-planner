/**
 * Was für die ganze Versammlung gilt: Stammdaten und Zeiten, Dienste und
 * Predigtdienstgruppen, Erinnerungen, die zusätzliche Klasse und die Sprachen
 * des Programms.
 */

import { syncAuxSlots } from '../../data/aux-class'
import {
  dienstAusWochenEntfernen,
  dienstBereichEntfernen,
  dienstZusagenKeys,
  gruppeInWochenUmbenennen,
  ohneDienstZusagen,
} from '../../data/dienste'
import { wirktAb } from '../../data/meeting-dates'
import { fsGruppeEntfernen } from '../../data/fs'
import { neuWennGeaendert } from '../../data/helpers'
import { endenNachziehen } from '../../data/meeting-edit'
import { type AppAction, type AppState, ERINNERUNG_GRENZEN } from '../context'
import { toastKey, wochenKennungen } from './gemeinsam'

type VersammlungAktion = Extract<
  AppAction,
  {
    type:
      | 'changeServiceCount'
      | 'removeService'
      | 'addService'
      | 'addGroup'
      | 'removeGroup'
      | 'updateGroup'
      | 'updateCongregation'
      | 'changeReminder'
      | 'setReminder'
      | 'toggleReminderRepeat'
      | 'setAuxClass'
      | 'setCongLang'
      | 'addProgLang'
      | 'removeProgLang'
  }
>

export function versammlung(state: AppState, action: VersammlungAktion): AppState {
  switch (action.type) {
    case 'changeServiceCount':
      return {
        ...state,
        services: state.services.map((s) =>
          s.key === action.key
            ? { ...s, count: Math.min(6, Math.max(1, s.count + action.delta)) }
            : s,
        ),
      }
    case 'removeService': {
      // Ein Dienst hinterlässt drei Spuren, und keine räumt sich selbst auf:
      // den Aufgabenbereich bei jeder Person, die Platzreihe in jeder Woche und
      // die Bestätigungen dieser Plätze (siehe data/dienste.ts).
      const keys = dienstZusagenKeys(state.weeks, action.key)
      return {
        ...state,
        services: state.services.filter((s) => s.key !== action.key),
        persons: dienstBereichEntfernen(state.persons, action.key),
        weeks: dienstAusWochenEntfernen(state.weeks, action.key),
        confirmations: ohneDienstZusagen(state.confirmations, keys),
        // Die Freigabe-Liste des gelöschten Dienstes darf nicht offen bleiben —
        // sie zeigte sonst Schalter für einen Bereich, den es nicht mehr gibt.
        svcSheet: state.svcSheet === action.key ? null : state.svcSheet,
        toast: toastKey(state, 'toastDienstDel'),
      }
    }
    case 'addService':
      return {
        ...state,
        services: [...state.services, action.service],
        toast: toastKey(state, 'toastDienstAdd'),
      }
    case 'addGroup':
      return {
        ...state,
        groups: [...state.groups, action.group],
        toast: toastKey(state, 'toastGruppeNeu'),
      }
    case 'removeGroup': {
      // Ihre Treffpunkte gehen mit — sonst erzeugte der Grundplan sie weiter,
      // ohne dass sie irgendwo noch zu löschen wären (`fsGruppeEntfernen`).
      const { fsRules, fsWeeks } = fsGruppeEntfernen(state.fsRules, state.fsWeeks, action.id, wochenKennungen(state), wirktAb())
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.id),
        // Mitglieder der gelöschten Gruppe verlieren ihre Zuordnung. Das nennt
        // die Rückfrage vor dem Löschen, und danach die Warnung „Ohne
        // Predigtdienstgruppe" (`ohneGruppe`).
        persons: state.persons.map((p) => (p.grp === action.id ? { ...p, grp: null } : p)),
        fsRules,
        fsWeeks,
        // Ihre Besuche ebenso — in der Datenbank per Kaskade.
        gruppenbesuche: neuWennGeaendert(
          state.gruppenbesuche,
          state.gruppenbesuche.filter((b) => b.grp !== action.id),
        ),
        // Eine Woche eines weiteren Plans bleibt, nur ohne Gruppe — wie in der
        // Datenbank (`on delete set null`).
        planEintraege: neuWennGeaendert(
          state.planEintraege,
          state.planEintraege.map((e) => (e.grp === action.id ? { ...e, grp: null } : e)),
        ),
        toast: toastKey(state, 'toastGruppeDel'),
      }
    }
    case 'updateGroup': {
      const vorher = state.groups.find((g) => g.id === action.id)
      const neuerName = action.patch.name
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
        // Ein neuer Name zieht durch die geplante Reinigung — sie kennt die
        // Gruppe nur beim Namen (`gruppeInWochenUmbenennen`).
        weeks:
          vorher && neuerName !== undefined
            ? gruppeInWochenUmbenennen(state.weeks, state.services, vorher.name, neuerName)
            : state.weeks,
      }
    }
    case 'updateCongregation': {
      const congregation = { ...state.congregation, ...action.patch }
      // Ändert sich die Zusammenkunftszeit, wandern die Endzeiten der schon
      // geladenen Wochen mit. Sie stehen in den Wochendaten; die Startzeit
      // dagegen kommt bei jeder Anzeige frisch aus den Einstellungen. Ohne das
      // hier stünde nach einer Umstellung auf jedem Programmblatt eine
      // Zusammenkunft, die 45 Minuten länger dauert als geplant.
      const weeks =
        action.patch.times !== undefined && action.patch.times !== state.congregation.times
          ? endenNachziehen(state.weeks, state.congregation.times, action.patch.times)
          : state.weeks
      return { ...state, congregation, weeks }
    }
    case 'changeReminder':
    case 'setReminder': {
      // Schrittweise (− und +) oder unmittelbar (die Wahl der letzten
      // Erinnerung) — beide Wege enden an denselben Grenzen, die auch die
      // Datenbank prüft. Ein Wert darüber hinaus wird geklemmt, nicht
      // abgewiesen: So schreibt `persist` nie etwas, das die Spalte ablehnt.
      const { min, max } = ERINNERUNG_GRENZEN[action.key]
      const gewuenscht = action.type === 'setReminder' ? action.value : state.reminders[action.key] + action.delta
      const value = Math.max(min, Math.min(max, gewuenscht))
      return { ...state, reminders: { ...state.reminders, [action.key]: value } }
    }
    case 'toggleReminderRepeat':
      return { ...state, reminders: { ...state.reminders, repeat: !state.reminders.repeat } }
    case 'setAuxClass':
      // Beim Einschalten bekommen alle Schuelerteile ihre zweite Platzreihe.
      // Beim Ausschalten bleibt sie stehen (nur unsichtbar) — sonst waere die
      // Planung mehrerer Wochen mit einem Fehlgriff weg. Beides ab der
      // laufenden Woche: Die davor fanden so statt, wie sie dastehen.
      return {
        ...state,
        auxClass: action.on,
        weeks: syncAuxSlots(state.weeks, action.on, wirktAb()),
        toast: toastKey(state, action.on ? 'toastAuxAn' : 'toastAuxAus'),
      }
    case 'setCongLang': {
      // Wird eine weitere Programmsprache zur Sprache der Versammlung, ist sie
      // keine weitere mehr — sonst stünde sie zweimal da („Englisch, Englisch").
      const progLangs = state.progLangs.filter((c) => c !== action.code)
      return {
        ...state,
        congLang: action.code,
        progLangs: progLangs.length === state.progLangs.length ? state.progLangs : progLangs,
        langSheetOpen: false,
        langSearch: '',
      }
    }
    case 'addProgLang': {
      // Versammlungssprache selbst und Duplikate ergeben keine Variante
      const skip = action.code === state.congLang || state.progLangs.includes(action.code)
      return {
        ...state,
        progLangs: skip ? state.progLangs : [...state.progLangs, action.code],
        langSheetOpen: false,
        langSearch: '',
        toast: skip ? state.toast : toastKey(state, 'toastProgLangAdd'),
      }
    }
    case 'removeProgLang':
      return {
        ...state,
        progLangs: state.progLangs.filter((c) => c !== action.code),
        toast: toastKey(state, 'toastProgLangDel'),
      }
  }
}
