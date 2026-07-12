/**
 * Zentraler App-State — portiert die State-Struktur der Prototyp-Logikklasse
 * (docs/design-handoff) nach React (Context + Reducer). In-Memory mit
 * Demo-Daten; Persistenz/Auth kommen später (siehe README "Hosting").
 */

import { useEffect, useMemo, useReducer, type ReactNode } from 'react'
import {
  buildDemoWeeks,
  DEMO_ABSENCES,
  DEMO_NOTIFICATIONS,
  DEMO_PERSONS,
  DEMO_PLANNER,
  DEMO_SERVICES,
} from '../data/demo'
import { buildImportWeek } from '../data/demo'
import { assignSlot, autoAssignMeeting } from '../data/planning'
import type { Notification, NotificationType, Screen, Theme } from '../data/types'
import { AppContext, type AppAction, type AppState } from './context'

/** Nächster Toast (id erzwingt Timer-/Animations-Neustart bei gleichem Text). */
function nextToast(state: AppState, text: string): AppState['toast'] {
  return { id: (state.toast?.id ?? 0) + 1, text }
}

/** Neue Mitteilung vorne anfügen ("gerade eben", ungelesen). */
function pushNotif(
  notifs: Notification[],
  type: NotificationType,
  title: string,
  text: string,
): Notification[] {
  return [
    { id: `n${notifs.length + 1}`, type, title, text, time: 'gerade eben', read: false },
    ...notifs,
  ]
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'login':
      return { ...state, screen: 'programm' }
    case 'logout':
      return { ...state, screen: 'login', notifOpen: false, slotSel: null, selectedPersonId: null }
    case 'navigate': {
      // Rechteprüfung wie im Prototyp: Nicht-Planer landen im Programm
      const plannerOnly: Screen[] = ['planen', 'personen', 'einstellungen']
      const screen =
        !state.planner && plannerOnly.includes(action.screen) ? 'programm' : action.screen
      return { ...state, screen, notifOpen: false, slotSel: null, selectedPersonId: null }
    }
    case 'prevWeek':
      return { ...state, week: Math.max(0, state.week - 1) }
    case 'nextWeek':
      return { ...state, week: Math.min(state.weeks.length - 1, state.week + 1) }
    case 'setTab':
      return { ...state, tab: action.tab }
    case 'setTheme':
      return { ...state, theme: action.theme }
    case 'openNotifs':
      return { ...state, notifOpen: true }
    case 'closeNotifs':
      return { ...state, notifOpen: false }
    case 'markAllRead':
      return { ...state, notifs: state.notifs.map((n) => ({ ...n, read: true })) }
    case 'openSlot':
      return { ...state, slotSel: action.sel }
    case 'closeSlot':
      return { ...state, slotSel: null }
    case 'addAbsence':
      return {
        ...state,
        absences: [...state.absences, action.absence],
        toast: nextToast(state, 'Abwesenheit eingetragen'),
      }
    case 'removeAbsence':
      return {
        ...state,
        absences: state.absences.filter((a) => a.id !== action.id),
        toast: nextToast(state, 'Abwesenheit entfernt'),
      }
    case 'selectPerson':
      return { ...state, selectedPersonId: action.id }
    case 'addPerson':
      return {
        ...state,
        persons: [...state.persons, action.person],
        selectedPersonId: action.person.id,
        toast: nextToast(state, 'Neue Person angelegt'),
      }
    case 'updatePerson':
      return {
        ...state,
        persons: state.persons.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      }
    case 'savePerson':
      return { ...state, selectedPersonId: null, toast: nextToast(state, 'Gespeichert') }
    case 'changeServiceCount':
      return {
        ...state,
        services: state.services.map((s) =>
          s.key === action.key
            ? { ...s, count: Math.min(6, Math.max(1, s.count + action.delta)) }
            : s,
        ),
      }
    case 'removeService':
      return {
        ...state,
        services: state.services.filter((s) => s.key !== action.key),
        toast: nextToast(state, 'Dienst entfernt'),
      }
    case 'addService':
      return {
        ...state,
        services: [...state.services, action.service],
        toast: nextToast(state, 'Dienst hinzugefügt'),
      }
    case 'startImport':
      return state.importing || state.imported ? state : { ...state, importing: true }
    case 'finishImport': {
      if (state.imported) return state
      const week = buildImportWeek()
      return {
        ...state,
        weeks: [...state.weeks, week],
        importing: false,
        imported: true,
        notifs: pushNotif(
          state.notifs,
          'import',
          'Programm importiert',
          `${week.range} · ${week.book} — ohne Zuteilungen`,
        ),
        toast: nextToast(state, 'Arbeitsheft-Woche importiert'),
      }
    }
    case 'assign': {
      // Zuteilen bzw. Entfernen ("") + Mitteilung (Prototyp: assignTo)
      const sel = state.slotSel
      if (!sel) return state
      const weeks = assignSlot(state.weeks, sel, action.name)
      const notifs = action.name
        ? pushNotif(
            state.notifs,
            'gesendet',
            'Zuteilung gesendet',
            `${action.name} — ${sel.label} · ${state.weeks[sel.wi].range}`,
          )
        : state.notifs
      return {
        ...state,
        weeks,
        notifs,
        slotSel: null,
        toast: nextToast(state, action.name ? 'Zugeteilt · Mitteilung gesendet' : 'Zuteilung entfernt'),
      }
    }
    case 'autoAssign': {
      const { weeks, count } = autoAssignMeeting(
        state.weeks,
        state.week,
        state.tab,
        state.persons,
        state.services,
      )
      if (count === 0) {
        return { ...state, toast: nextToast(state, 'Keine offenen Zuteilungen in dieser Ansicht') }
      }
      const notifs = pushNotif(
        state.notifs,
        'gesendet',
        'Zuteilungen gesendet',
        `${count} Zuteilungen · ${state.weeks[state.week].range}`,
      )
      return {
        ...state,
        weeks,
        notifs,
        toast: nextToast(state, `${count} Zuteilungen automatisch vergeben`),
      }
    }
    case 'showToast':
      return { ...state, toast: nextToast(state, action.text) }
    case 'hideToast':
      return { ...state, toast: null }
  }
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  // index.html hat das Attribut vor dem ersten Paint gesetzt (Systempräferenz)
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function initialState(): AppState {
  return {
    screen: 'login',
    week: 0,
    tab: 'mid',
    theme: getInitialTheme(),
    planner: DEMO_PLANNER,
    weeks: buildDemoWeeks(),
    persons: DEMO_PERSONS,
    services: DEMO_SERVICES,
    absences: DEMO_ABSENCES,
    notifs: DEMO_NOTIFICATIONS,
    notifOpen: false,
    slotSel: null,
    selectedPersonId: null,
    importing: false,
    imported: false,
    toast: null,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  // Theme auf <html> spiegeln + Wahl merken (Muster aus index.html)
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
    localStorage.setItem('theme', state.theme)
  }, [state.theme])

  // Toast automatisch ausblenden (2.4 s wie im Prototyp)
  useEffect(() => {
    if (!state.toast) return
    const timer = setTimeout(() => dispatch({ type: 'hideToast' }), 2400)
    return () => clearTimeout(timer)
  }, [state.toast])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
