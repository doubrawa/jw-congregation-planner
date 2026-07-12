/**
 * Zentraler App-State — portiert die State-Struktur der Prototyp-Logikklasse
 * (docs/design-handoff) nach React (Context + Reducer). In-Memory mit
 * Demo-Daten; Persistenz/Auth kommen später (siehe README "Hosting").
 */

import { useEffect, useMemo, useReducer, type ReactNode } from 'react'
import {
  buildDemoWeeks,
  buildImportWeek,
  CURRENT_PERSON_ID,
  DEMO_ABSENCES,
  DEMO_MY_TASKS,
  DEMO_NOTIFICATIONS,
  DEMO_PENDING_NAMES,
  DEMO_PERSONS,
  DEMO_PLANNER,
  DEMO_REMINDERS,
  DEMO_SERVICES,
} from '../data/demo'
import { displayName } from '../data/helpers'
import { assignSlot, autoAssignMeeting, lacAdd, lacAdjust, lacMove, lacRemove } from '../data/planning'
import { supabase } from '../lib/supabase'
import type { Lang, Notification, NotificationType, Screen, Theme } from '../data/types'
import { AppContext, type AppAction, type AppState } from './context'

/** Nächster Toast (id erzwingt Timer-/Animations-Neustart bei gleichem Text). */
function nextToast(state: AppState, text: string): AppState['toast'] {
  return { id: (state.toast?.id ?? 0) + 1, text }
}

function makeNotif(
  type: NotificationType,
  title: string,
  text: string,
  taskId?: string,
): Notification {
  return { id: crypto.randomUUID(), type, title, text, time: 'gerade eben', read: false, taskId }
}

/** Neue Mitteilung vorne anfügen. */
function pushNotif(
  notifs: Notification[],
  type: NotificationType,
  title: string,
  text: string,
): Notification[] {
  return [makeNotif(type, title, text), ...notifs]
}

/** Anzeigename des eingeloggten Demo-Nutzers (für pendingNames-Pflege). */
function currentUserName(state: AppState): string {
  const me = state.persons.find((p) => p.id === CURRENT_PERSON_ID)
  return me ? displayName(me) : ''
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'login':
      return {
        ...state,
        screen: 'programm',
        confirmOpen: state.myTasks.some((t) => t.status === 'offen'),
      }
    case 'logout':
      return {
        ...state,
        screen: 'login',
        notifOpen: false,
        slotSel: null,
        selectedPersonId: null,
        langSheetOpen: false,
        s89: null,
        confirmOpen: false,
      }
    case 'navigate': {
      // Rechteprüfung wie im Prototyp: Nicht-Planer landen im Programm
      const plannerOnly: Screen[] = ['planen', 'personen', 'einstellungen']
      const screen =
        !state.planner && plannerOnly.includes(action.screen) ? 'programm' : action.screen
      return {
        ...state,
        screen,
        notifOpen: false,
        slotSel: null,
        selectedPersonId: null,
        langSheetOpen: false,
      }
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
      const pendingNames =
        action.name && !state.pendingNames.includes(action.name)
          ? [...state.pendingNames, action.name]
          : state.pendingNames
      return {
        ...state,
        weeks,
        notifs,
        pendingNames,
        slotSel: null,
        toast: nextToast(state, action.name ? 'Zugeteilt · Mitteilung gesendet' : 'Zuteilung entfernt'),
      }
    }
    case 'autoAssign': {
      const { weeks, count, newly } = autoAssignMeeting(
        state.weeks,
        state.week,
        state.tab,
        state.persons,
        state.services,
      )
      if (count === 0) {
        return { ...state, toast: nextToast(state, 'Keine offenen Zuteilungen in dieser Ansicht') }
      }
      const pending = new Set(state.pendingNames)
      for (const n of newly) pending.add(n)
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
        pendingNames: [...pending],
        toast: nextToast(state, `${count} Zuteilungen automatisch vergeben`),
      }
    }
    case 'confirmTask': {
      const myTasks = state.myTasks.map((t) =>
        t.id === action.id ? { ...t, status: 'bestätigt' as const } : t,
      )
      const stillOpen = myTasks.some((t) => t.status === 'offen')
      const myName = currentUserName(state)
      const pendingNames = stillOpen
        ? state.pendingNames
        : state.pendingNames.filter((n) => n !== myName)
      return {
        ...state,
        myTasks,
        pendingNames,
        confirmOpen: state.confirmOpen && stillOpen,
        toast: nextToast(state, 'Bestätigt · der Koordinator sieht den Status'),
      }
    }
    case 'declineTask': {
      const task = state.myTasks.find((t) => t.id === action.id)
      const myTasks = state.myTasks.map((t) =>
        t.id === action.id ? { ...t, status: 'verhindert' as const } : t,
      )
      const stillOpen = myTasks.some((t) => t.status === 'offen')
      const notif = makeNotif(
        'verhindert',
        'Verhinderung gemeldet',
        `${task?.title ?? ''} — ${currentUserName(state)}`,
      )
      return {
        ...state,
        myTasks,
        confirmOpen: state.confirmOpen && stillOpen,
        notifs: [notif, ...state.notifs],
        toast: nextToast(state, 'Gemeldet · der Koordinator wird informiert'),
      }
    }
    case 'openS89':
      return { ...state, s89: action.payload }
    case 'closeS89':
      return { ...state, s89: null }
    case 'lacAdjust':
      return {
        ...state,
        weeks: lacAdjust(state.weeks, state.week, state.tab, action.si, action.ii, action.delta),
      }
    case 'lacRemove':
      return {
        ...state,
        weeks: lacRemove(state.weeks, state.week, state.tab, action.si, action.ii),
        toast: nextToast(state, 'Programmpunkt entfernt · Zeiten angepasst'),
      }
    case 'lacMove':
      return {
        ...state,
        weeks: lacMove(state.weeks, state.week, state.tab, action.si, action.ii, action.dir),
      }
    case 'lacAdd':
      return {
        ...state,
        weeks: lacAdd(state.weeks, state.week, state.tab, action.si, action.title),
        toast: nextToast(state, 'Programmpunkt eingefügt · Zeiten angepasst'),
      }
    case 'changeReminder': {
      const bounds = action.key === 'first' ? { min: 1, max: 21 } : { min: 0, max: 7 }
      const value = Math.max(bounds.min, Math.min(bounds.max, state.reminders[action.key] + action.delta))
      return { ...state, reminders: { ...state.reminders, [action.key]: value } }
    }
    case 'toggleReminderRepeat':
      return { ...state, reminders: { ...state.reminders, repeat: !state.reminders.repeat } }
    case 'setLang':
      return { ...state, lang: action.lang }
    case 'openLangSheet':
      return { ...state, langSheetOpen: true, slotSel: null }
    case 'closeLangSheet':
      return { ...state, langSheetOpen: false, langSearch: '' }
    case 'setLangSearch':
      return { ...state, langSearch: action.text }
    case 'setCongLang':
      return { ...state, congLang: action.name, langSheetOpen: false, langSearch: '' }
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

function getInitialLang(): Lang {
  const stored = localStorage.getItem('lang')
  return stored === 'en' || stored === 'es' || stored === 'fr' ? stored : 'de'
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
    myTasks: DEMO_MY_TASKS,
    pendingNames: DEMO_PENDING_NAMES,
    confirmOpen: false,
    s89: null,
    reminders: DEMO_REMINDERS,
    lang: getInitialLang(),
    congLang: 'Deutsch',
    langSheetOpen: false,
    langSearch: '',
    toast: null,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  // Supabase-Session spiegeln (nur wenn konfiguriert): bestehende Session
  // überspringt den Login-Screen; SIGNED_OUT (z. B. in anderem Tab) wirft
  // zurück zum Login. Anmelden selbst dispatcht der Login-Screen.
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) dispatch({ type: 'login' })
    })
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') dispatch({ type: 'logout' })
    })
    return () => data.subscription.unsubscribe()
  }, [dispatch])

  // Theme auf <html> spiegeln + Wahl merken (Muster aus index.html)
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
    localStorage.setItem('theme', state.theme)
  }, [state.theme])

  // App-Sprache merken
  useEffect(() => {
    localStorage.setItem('lang', state.lang)
    document.documentElement.lang = state.lang
  }, [state.lang])

  // Toast automatisch ausblenden (2.4 s wie im Prototyp)
  useEffect(() => {
    if (!state.toast) return
    const timer = setTimeout(() => dispatch({ type: 'hideToast' }), 2400)
    return () => clearTimeout(timer)
  }, [state.toast])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
