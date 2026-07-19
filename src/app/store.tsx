/**
 * Zentraler App-State — portiert die State-Struktur der Prototyp-Logikklasse
 * (docs/design-handoff) nach React (Context + Reducer). In-Memory mit
 * Demo-Daten; Persistenz/Auth kommen später (siehe README "Hosting").
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import {
  buildDemoWeeks,
  buildImportWeek,
  CONGREGATION,
  CURRENT_PERSON_ID,
  DEMO_ABSENCES,
  DEMO_MY_TASKS,
  DEMO_NOTIFICATIONS,
  DEMO_PENDING_NAMES,
  DEMO_GROUPS,
  DEMO_PERSONS,
  DEMO_PLANNER,
  DEMO_REMINDERS,
  DEMO_SERVICES,
} from '../data/demo'
import { isDarkTheme, THEME_LIST } from '../data/constants'
import { displayName } from '../data/helpers'
import { localizedWeeks } from '../data/localize'
import {
  assignSlot,
  autoAssignMeeting,
  deriveMyTasks,
  derivePendingNames,
  lacAdd,
  lacAdjust,
  lacMove,
  lacRemove,
} from '../data/planning'
import { dict, type Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import {
  deleteAbsenceRow,
  deleteGroupRow,
  deletePersonRow,
  deleteInviteRow,
  deleteMemberRow,
  deleteServiceRow,
  insertNotification,
  markNotificationsRead,
  saveAbsence,
  saveConfirmation,
  saveCongregationInfo,
  saveGroupRow,
  saveInvite,
  saveInvitePlanner,
  saveMemberRow,
  savePerson,
  savePersonGroup,
  saveService,
  saveSettings,
  saveWeek,
} from '../lib/data'
import { APP_LANGS, APP_TO_JW, congAppCode, isRTL } from '../i18n/langs'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Lang, Notification, NotificationType, Person, Screen, Theme } from '../data/types'
import { AppContext, type AppAction, type AppState } from './context'
import { loadAndHydrate } from './hydrate'

/** Nächster Toast (id erzwingt Timer-/Animations-Neustart bei gleichem Text). */
function nextToast(state: AppState, text: string): AppState['toast'] {
  return { id: (state.toast?.id ?? 0) + 1, text }
}

/** Toast aus einem übersetzten UI-Schlüssel (Reducer kennt state.lang). */
function toastKey(
  state: AppState,
  key: keyof Dict,
  params?: Record<string, string | number>,
): AppState['toast'] {
  return nextToast(state, fill(dict(state.lang)[key], params ?? {}))
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

/**
 * Beim Anlegen abgebrochene Personen (komplett ohne Namen) werden beim
 * Verlassen des Details automatisch wieder entfernt — sonst blieben durch das
 * Auto-Speichern leere Einträge in der Liste stehen.
 */
function isNameless(p: Person): boolean {
  return !`${p.fn}${p.ln}${p.dn ?? ''}`.trim()
}

function dropNamelessSelected(state: AppState): AppState {
  const sel = state.selectedPersonId
  if (!sel) return state
  const person = state.persons.find((p) => p.id === sel)
  if (!person || !isNameless(person)) return state
  return { ...state, persons: state.persons.filter((p) => p.id !== sel) }
}

/** Anzeigename des eingeloggten Nutzers (für pendingNames-Pflege). */
function currentUserName(state: AppState): string {
  const id = state.personId ?? CURRENT_PERSON_ID
  const me = state.persons.find((p) => p.id === id)
  return me ? displayName(me) : ''
}

/**
 * Produktionsmodus: myTasks/pendingNames aus Wochen + Bestätigungen ableiten
 * (im Demo-Modus bleiben die Demo-Daten unangetastet). `openConfirm` öffnet
 * nach der Hydration das Bestätigungs-Modal, falls offene Aufgaben existieren.
 */
function withDerivedTasks(state: AppState, openConfirm: boolean): AppState {
  if (state.dataStatus === 'demo') return state
  const me = state.persons.find((p) => p.id === state.personId)
  // Aufgaben-Titel in der Programmsprache des Nutzers ableiten (Sprachvariante
  // der Wochen, falls vorhanden) — Slot-Pfade/Namen sind variantenunabhängig.
  const jwCode = state.lang !== congAppCode(state.congLang) ? APP_TO_JW[state.lang] : undefined
  const weeks = localizedWeeks(state.weeks, jwCode)
  const myTasks = me
    ? deriveMyTasks(weeks, state.services, displayName(me), state.confirmations)
    : []
  return {
    ...state,
    myTasks,
    pendingNames: derivePendingNames(weeks, state.services, state.confirmations),
    confirmOpen: (openConfirm || state.confirmOpen) && myTasks.some((t) => t.status === 'offen'),
  }
}

/** Aktionen, nach denen die Aufgaben-Ableitung neu berechnet werden muss. */
const DERIVE_ACTIONS: ReadonlySet<AppAction['type']> = new Set<AppAction['type']>([
  'hydrate',
  'assign',
  'autoAssign',
  'finishImport',
  'addImportedWeek',
  'mergeWeekAlt',
  'updatePerson',
  'lacAdjust',
  'lacRemove',
  'lacMove',
  'lacAdd',
  'addService',
  'removeService',
  'changeServiceCount',
  'confirmTask',
  'declineTask',
  // Sprachwechsel ändert die Programmsprache der abgeleiteten Aufgaben-Titel
  'setLang',
  'setCongLang',
])

function reducer(state: AppState, action: AppAction): AppState {
  const next = baseReducer(state, action)
  return DERIVE_ACTIONS.has(action.type)
    ? withDerivedTasks(next, action.type === 'hydrate')
    : next
}

function baseReducer(state: AppState, action: AppAction): AppState {
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
        recovery: false,
      }
    case 'navigate': {
      // Rechteprüfung wie im Prototyp: Nicht-Planer landen im Programm
      const plannerOnly: Screen[] = ['planen', 'personen', 'einstellungen']
      const screen =
        !state.planner && plannerOnly.includes(action.screen) ? 'programm' : action.screen
      return {
        ...dropNamelessSelected(state),
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
        toast: toastKey(state, 'toastAbwAdd'),
      }
    case 'removeAbsence':
      return {
        ...state,
        absences: state.absences.filter((a) => a.id !== action.id),
        toast: toastKey(state, 'toastAbwDel'),
      }
    case 'selectPerson':
      return { ...dropNamelessSelected(state), selectedPersonId: action.id }
    case 'removePerson': {
      // Person löschen: Referenzen lösen (Gruppenleitung, Konto, offene
      // Codes); Namen in bereits geplanten Wochen bleiben als Text stehen.
      return {
        ...state,
        persons: state.persons.filter((p) => p.id !== action.id),
        groups: state.groups.map((g) => ({
          ...g,
          ov: g.ov === action.id ? null : g.ov,
          as: g.as === action.id ? null : g.as,
        })),
        members: state.members.map((m) =>
          m.personId === action.id ? { ...m, personId: null } : m,
        ),
        invites: state.invites.map((i) =>
          i.personId === action.id ? { ...i, personId: null } : i,
        ),
        selectedPersonId: null,
        toast: toastKey(state, 'toastPersonDel'),
      }
    }
    case 'addPerson':
      return {
        ...state,
        persons: [...state.persons, action.person],
        selectedPersonId: action.person.id,
        toast: toastKey(state, 'toastPersonNeu'),
      }
    case 'updatePerson': {
      const next = {
        ...state,
        persons: state.persons.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      }
      // Planer-Recht in verknüpfte Konten und offene Einladungscodes spiegeln
      // (members.planner = Quelle der Rechteprüfung); das eigene Konto ist per
      // UI-Sperre ausgenommen.
      if ('planner' in action.patch) {
        const on = Boolean(action.patch.planner)
        next.members = state.members.map((m) =>
          m.personId === action.id && m.userId !== state.userId ? { ...m, planner: on } : m,
        )
        next.invites = state.invites.map((i) =>
          i.personId === action.id ? { ...i, planner: on } : i,
        )
      }
      return next
    }
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
        toast: toastKey(state, 'toastDienstDel'),
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
    case 'removeGroup':
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.id),
        // Mitglieder der gelöschten Gruppe verlieren ihre Zuordnung
        persons: state.persons.map((p) => (p.grp === action.id ? { ...p, grp: null } : p)),
        toast: toastKey(state, 'toastGruppeDel'),
      }
    case 'updateGroup':
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      }
    case 'updateCongregation':
      return { ...state, congregation: { ...state.congregation, ...action.patch } }
    case 'updateMember':
      return {
        ...state,
        members: state.members.map((m) =>
          m.userId === action.userId ? { ...m, ...action.patch } : m,
        ),
      }
    case 'removeMember':
      return {
        ...state,
        members: state.members.filter((m) => m.userId !== action.userId),
        toast: toastKey(state, 'toastMitgliedEntfernt'),
      }
    case 'addInvite':
      return {
        ...state,
        invites: [...state.invites, action.invite],
        toast: toastKey(state, 'toastEinladungErstellt'),
      }
    case 'removeInvite':
      return {
        ...state,
        invites: state.invites.filter((i) => i.id !== action.id),
        toast: toastKey(state, 'toastEinladungGeloescht'),
      }
    case 'setRecovery':
      return { ...state, recovery: action.on }
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
        toast: toastKey(state, 'toastImportiert'),
      }
    }
    case 'addImportedWeek': {
      const week = action.week
      return {
        ...state,
        weeks: [...state.weeks, week],
        importing: false,
        notifs: pushNotif(
          state.notifs,
          'import',
          'Programm importiert',
          `${week.range} · ${week.book} — ohne Zuteilungen`,
        ),
        toast: toastKey(state, 'toastImportiert'),
      }
    }
    case 'mergeWeekAlt':
      // Nachgeladene Sprachvarianten in die bestehende Woche mischen
      return {
        ...state,
        weeks: state.weeks.map((w, i) =>
          i === action.wi ? { ...w, alt: { ...w.alt, ...action.alt } } : w,
        ),
      }
    case 'stopImport':
      return { ...state, importing: false }
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
        toast: action.name ? toastKey(state, 'toastZugeteilt') : toastKey(state, 'toastEntfernt'),
      }
    }
    case 'autoAssign': {
      if (!state.weeks[state.week]) return state // keine Wochen geladen
      const { weeks, count, newly, unfilled } = autoAssignMeeting(
        state.weeks,
        state.week,
        state.tab,
        state.persons,
        state.services,
        state.groups,
      )
      if (count === 0) {
        // Offen gebliebene, aber nicht besetzbare Slots (keine passende/freie
        // Person) klar von „nichts offen“ unterscheiden.
        const key = unfilled > 0 ? 'toastKeinePassende' : 'toastKeineOffen'
        return { ...state, toast: toastKey(state, key) }
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
        toast: toastKey(state, 'toastAutoN', { n: count }),
      }
    }
    case 'confirmTask': {
      // Produktionsmodus: Status in die ConfirmationMap — myTasks/pending-
      // Names/confirmOpen folgen aus der Ableitung (withDerivedTasks).
      if (state.dataStatus !== 'demo') {
        return {
          ...state,
          confirmations: { ...state.confirmations, [action.id]: 'bestätigt' },
          toast: toastKey(state, 'toastBestaetigt'),
        }
      }
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
        toast: toastKey(state, 'toastBestaetigt'),
      }
    }
    case 'declineTask': {
      const task = state.myTasks.find((t) => t.id === action.id)
      const notif = makeNotif(
        'verhindert',
        'Verhinderung gemeldet',
        `${task?.title ?? ''} — ${currentUserName(state)}`,
      )
      if (state.dataStatus !== 'demo') {
        return {
          ...state,
          confirmations: { ...state.confirmations, [action.id]: 'verhindert' },
          notifs: [notif, ...state.notifs],
          toast: toastKey(state, 'toastVerhindert'),
        }
      }
      const myTasks = state.myTasks.map((t) =>
        t.id === action.id ? { ...t, status: 'verhindert' as const } : t,
      )
      const stillOpen = myTasks.some((t) => t.status === 'offen')
      return {
        ...state,
        myTasks,
        confirmOpen: state.confirmOpen && stillOpen,
        notifs: [notif, ...state.notifs],
        toast: toastKey(state, 'toastVerhindert'),
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
        toast: toastKey(state, 'toastLacDel'),
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
        toast: toastKey(state, 'toastLacAdd'),
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
      return { ...state, langSheetOpen: true, langSheetFor: action.mode ?? 'cong', slotSel: null }
    case 'closeLangSheet':
      return { ...state, langSheetOpen: false, langSearch: '' }
    case 'setLangSearch':
      return { ...state, langSearch: action.text }
    case 'setCongLang':
      return { ...state, congLang: action.name, langSheetOpen: false, langSearch: '' }
    case 'addProgLang': {
      // Versammlungssprache selbst und Duplikate ergeben keine Variante
      const skip = action.name === state.congLang || state.progLangs.includes(action.name)
      return {
        ...state,
        progLangs: skip ? state.progLangs : [...state.progLangs, action.name],
        langSheetOpen: false,
        langSearch: '',
        toast: skip ? state.toast : toastKey(state, 'toastProgLangAdd'),
      }
    }
    case 'removeProgLang':
      return {
        ...state,
        progLangs: state.progLangs.filter((n) => n !== action.name),
        toast: toastKey(state, 'toastProgLangDel'),
      }
    case 'hydrate': {
      const p = action.payload
      return {
        ...state,
        congregation: p.congregation,
        congregationId: p.congregationId,
        userId: p.userId,
        personId: p.personId,
        planner: p.planner,
        dataStatus: 'ready',
        dataEmpty: p.empty,
        persons: p.persons,
        services: p.services,
        groups: p.groups,
        weeks: p.weeks,
        absences: p.absences,
        notifs: p.notifications,
        confirmations: p.confirmations,
        reminders: p.reminders,
        congLang: p.congLang,
        progLangs: p.progLangs,
        members: p.members,
        invites: p.invites,
        week: 0,
      }
    }
    case 'setDataStatus':
      return { ...state, dataStatus: action.status, userId: action.userId ?? state.userId }
    case 'showToast':
      return { ...state, toast: nextToast(state, action.text) }
    case 'hideToast':
      return { ...state, toast: null }
  }
}

/** Alte gespeicherte Werte (vor den 8 Farbschemata) auf Paletten mappen. */
const LEGACY_THEME: Record<string, Theme> = { light: 'weiss', dark: 'graphit' }

function asTheme(value: string | null): Theme | null {
  if (!value) return null
  if (LEGACY_THEME[value]) return LEGACY_THEME[value]
  return THEME_LIST.some((t) => t.key === value) ? (value as Theme) : null
}

function getInitialTheme(): Theme {
  const stored = asTheme(localStorage.getItem('theme'))
  if (stored) return stored
  // index.html hat das Attribut vor dem ersten Paint gesetzt (Systempräferenz)
  return document.documentElement.dataset.theme === 'graphit' ? 'graphit' : 'weiss'
}

function getInitialLang(): Lang {
  const stored = localStorage.getItem('lang')
  return APP_LANGS.some((l) => l.code === stored) ? (stored as Lang) : 'de'
}

/**
 * Nur im Dev-Build: erlaubt das direkte Anspringen eines Screens/einer Sprache
 * über den URL-Hash `#s=<screen>&l=<lang>&c=<congLang>` — für Headless-
 * Screenshots (überspringt den Login im Demo-Modus). Im Production-Build wird
 * dieser Zweig via `import.meta.env.DEV` entfernt.
 */
function parseDebugHash():
  | { screen?: Screen; lang?: Lang; congLang?: string; theme?: Theme; personId?: string }
  | null {
  const raw = location.hash.replace(/^#/, '')
  if (!raw) return null
  const p = new URLSearchParams(raw)
  const out: { screen?: Screen; lang?: Lang; congLang?: string; theme?: Theme; personId?: string } = {}
  const s = p.get('s')
  if (s) out.screen = s as Screen
  const l = p.get('l')
  if (l) out.lang = l as Lang
  const c = p.get('c')
  if (c) out.congLang = c
  const th = asTheme(p.get('t'))
  if (th) out.theme = th
  const person = p.get('p')
  if (person) out.personId = person
  return Object.keys(out).length ? out : null
}

function initialState(): AppState {
  // Konfiguriert (Supabase): leerer Start, Daten kommen per Hydration nach dem
  // Login. Demo-Modus: In-Memory-Demo-Daten wie bisher. Ein Debug-Hash erzwingt
  // im Dev-Build zusätzlich den Demo-Modus (Daten sofort da, ohne Login/Netz).
  const debug = import.meta.env.DEV ? parseDebugHash() : null
  const demo = !isSupabaseConfigured || debug != null
  return {
    screen: debug?.screen ?? 'login',
    week: 0,
    tab: 'mid',
    theme: debug?.theme ?? getInitialTheme(),
    planner: demo ? DEMO_PLANNER : false,
    congregation: demo ? { ...CONGREGATION } : { name: '', hall: '', meetings: '' },
    congregationId: null,
    userId: null,
    personId: null,
    dataStatus: demo ? 'demo' : 'ready',
    dataEmpty: false,
    members: [],
    invites: [],
    recovery: false,
    weeks: demo ? buildDemoWeeks() : [],
    persons: demo ? DEMO_PERSONS : [],
    services: demo ? DEMO_SERVICES : [],
    groups: demo ? DEMO_GROUPS : [],
    absences: demo ? DEMO_ABSENCES : [],
    notifs: demo ? DEMO_NOTIFICATIONS : [],
    notifOpen: false,
    slotSel: null,
    selectedPersonId: debug?.personId ?? null,
    importing: false,
    imported: false,
    myTasks: demo ? DEMO_MY_TASKS : [],
    pendingNames: demo ? DEMO_PENDING_NAMES : [],
    confirmations: {},
    confirmOpen: false,
    s89: null,
    reminders: DEMO_REMINDERS,
    lang: debug?.lang ?? getInitialLang(),
    langSheetOpen: false,
    langSheetFor: 'cong',
    congLang: debug?.congLang ?? 'Deutsch',
    progLangs: [],
    langSearch: '',
    toast: null,
  }
}

/**
 * Nebeneffekt-Schicht: schreibt die zu einer Aktion gehörende Änderung nach
 * Supabase. Läuft nur im konfigurierten, hydrierten Zustand. Der Reducer
 * bleibt rein; hier werden `prev`/`next` (vor/nach der Aktion) ausgewertet.
 */
/**
 * Debounce für Personen-Edits: jede Feldänderung dispatcht `updatePerson`;
 * statt pro Tastenanschlag zu schreiben, wird der Save je Person gebündelt
 * (Timer wird bei jeder weiteren Änderung neu gestartet) und beim Verlassen
 * des Details sofort nachgeholt (flushPersonSaves).
 */
const PERSON_SAVE_DELAY = 600
const pendingPersonSaves = new Map<string, ReturnType<typeof setTimeout>>()

/** Ausstehenden Save einer Person verwerfen (vor dem Löschen). */
function cancelPersonSave(id: string): void {
  const timer = pendingPersonSaves.get(id)
  if (timer) {
    clearTimeout(timer)
    pendingPersonSaves.delete(id)
  }
}

function schedulePersonSave(congId: string, person: Person): void {
  const timer = pendingPersonSaves.get(person.id)
  if (timer) clearTimeout(timer)
  pendingPersonSaves.set(
    person.id,
    setTimeout(() => {
      pendingPersonSaves.delete(person.id)
      savePerson(congId, person)
    }, PERSON_SAVE_DELAY),
  )
}

function flushPersonSaves(congId: string, state: AppState): void {
  for (const [id, timer] of pendingPersonSaves) {
    clearTimeout(timer)
    pendingPersonSaves.delete(id)
    const person = state.persons.find((p) => p.id === id)
    if (person) savePerson(congId, person)
  }
}

/** Gleiche Debounce-Mechanik für die Versammlungs-Stammdaten. */
let congSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCongregationSave(congId: string, info: AppState['congregation']): void {
  if (congSaveTimer) clearTimeout(congSaveTimer)
  congSaveTimer = setTimeout(() => {
    congSaveTimer = null
    saveCongregationInfo(congId, info)
  }, PERSON_SAVE_DELAY)
}

function flushCongregationSave(congId: string, state: AppState): void {
  if (!congSaveTimer) return
  clearTimeout(congSaveTimer)
  congSaveTimer = null
  saveCongregationInfo(congId, state.congregation)
}

function persist(prev: AppState, next: AppState, action: AppAction): void {
  const congId = next.congregationId
  const userId = next.userId
  if (!supabase || !congId || !userId) return

  switch (action.type) {
    case 'assign': {
      const wi = prev.slotSel?.wi
      if (wi != null) saveWeek(congId, wi, next.weeks[wi])
      break
    }
    case 'autoAssign':
    case 'lacAdjust':
    case 'lacRemove':
    case 'lacMove':
    case 'lacAdd':
      saveWeek(congId, prev.week, next.weeks[prev.week])
      break
    case 'finishImport':
    case 'addImportedWeek': {
      const pos = next.weeks.length - 1
      if (pos >= 0) saveWeek(congId, pos, next.weeks[pos])
      break
    }
    case 'mergeWeekAlt':
      saveWeek(congId, action.wi, next.weeks[action.wi])
      break
    case 'addPerson':
      savePerson(congId, action.person)
      break
    case 'updatePerson': {
      // Auto-Speichern mit Debounce: Tipp-Änderungen werden gebündelt
      const p = next.persons.find((x) => x.id === action.id)
      if (p) schedulePersonSave(congId, p)
      // Planer-Recht sofort in gespiegelte Konten und offene Codes schreiben
      if ('planner' in action.patch) {
        for (const m of next.members) {
          if (m.personId === action.id && m.userId !== next.userId) saveMemberRow(m)
        }
        for (const i of next.invites) {
          if (i.personId === action.id) saveInvitePlanner(i.id, i.planner)
        }
      }
      break
    }
    case 'selectPerson':
    case 'navigate':
    case 'logout': {
      // Namenlose (abgebrochene) Person wurde im Reducer entfernt → auch in
      // der DB löschen, ohne dass ein ausstehender Save sie wiederbelebt.
      const sel = prev.selectedPersonId
      if (sel && prev.persons.some((p) => p.id === sel) && !next.persons.some((p) => p.id === sel)) {
        cancelPersonSave(sel)
        deletePersonRow(sel)
      }
      // Ansicht verlassen → ausstehende Debounce-Saves sofort schreiben
      flushPersonSaves(congId, next)
      flushCongregationSave(congId, prev)
      break
    }
    case 'removePerson': {
      cancelPersonSave(action.id)
      deletePersonRow(action.id) // groups/invites-FKs räumt die DB (set null)
      for (const m of prev.members) {
        if (m.personId === action.id) saveMemberRow({ ...m, personId: null })
      }
      break
    }
    case 'addAbsence':
      saveAbsence(congId, userId, next.personId, action.absence)
      break
    case 'removeAbsence':
      deleteAbsenceRow(action.id)
      break
    case 'addService': {
      const pos = next.services.length - 1
      if (pos >= 0) saveService(congId, action.service, pos)
      break
    }
    case 'changeServiceCount': {
      const idx = next.services.findIndex((s) => s.key === action.key)
      if (idx >= 0) saveService(congId, next.services[idx], idx)
      break
    }
    case 'removeService':
      deleteServiceRow(congId, action.key)
      break
    case 'addGroup':
      saveGroupRow(congId, action.group)
      break
    case 'updateGroup': {
      const group = next.groups.find((g) => g.id === action.id)
      if (group) saveGroupRow(congId, group)
      break
    }
    case 'removeGroup':
      deleteGroupRow(action.id)
      // Mitglieder der Gruppe haben grp=null bekommen → mitschreiben
      for (const p of next.persons) {
        if (prev.persons.find((q) => q.id === p.id)?.grp === action.id) savePersonGroup(p)
      }
      break
    case 'markAllRead':
      markNotificationsRead(congId)
      break
    case 'confirmTask':
      saveConfirmation(congId, userId, action.id, 'bestätigt')
      break
    case 'declineTask':
      saveConfirmation(congId, userId, action.id, 'verhindert')
      break
    case 'changeReminder':
    case 'toggleReminderRepeat':
    case 'setCongLang':
    case 'addProgLang':
    case 'removeProgLang':
      saveSettings(congId, {
        reminders: next.reminders,
        congLang: next.congLang,
        progLangs: next.progLangs,
      })
      break
    case 'updateCongregation':
      scheduleCongregationSave(congId, next.congregation)
      break
    case 'updateMember': {
      const member = next.members.find((m) => m.userId === action.userId)
      if (member) saveMemberRow(member)
      break
    }
    case 'removeMember':
      deleteMemberRow(action.userId)
      break
    case 'addInvite':
      saveInvite(congId, action.invite)
      break
    case 'removeInvite':
      deleteInviteRow(action.id)
      break
  }

  // Jede Aktion, die eine Mitteilung vorne anfügt, in die DB spiegeln
  // (user_id null = an alle Mitglieder der Versammlung).
  if (next.notifs.length > prev.notifs.length && next.notifs[0]) {
    const n = next.notifs[0]
    insertNotification(congId, null, n.type, n.title, n.text)
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState)

  // Persistenz-Wrapper: berechnet den Folgezustand (Reducer ist rein),
  // schreibt die Änderung nach Supabase und aktualisiert dann React.
  const stateRef = useRef(state)
  stateRef.current = state
  const dispatch = useCallback((action: AppAction) => {
    const prev = stateRef.current
    const next = reducer(prev, action)
    stateRef.current = next
    persist(prev, next, action)
    rawDispatch(action)
  }, [])

  // Supabase-Session spiegeln (nur wenn konfiguriert): bestehende Session
  // überspringt den Login-Screen und lädt die Daten; SIGNED_IN (nach Login)
  // lädt ebenfalls; SIGNED_OUT wirft zurück zum Login.
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        dispatch({ type: 'login' })
        void loadAndHydrate(dispatch, data.session.user.id)
      }
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') dispatch({ type: 'logout' })
      else if (event === 'PASSWORD_RECOVERY') dispatch({ type: 'setRecovery', on: true })
      else if (event === 'SIGNED_IN' && session) void loadAndHydrate(dispatch, session.user.id)
    })
    return () => data.subscription.unsubscribe()
  }, [dispatch])

  // Theme auf <html> spiegeln + Wahl merken (Muster aus index.html);
  // data-dark markiert die dunklen Paletten für dark-spezifische CSS-Regeln.
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
    if (isDarkTheme(state.theme)) {
      document.documentElement.dataset.dark = '1'
    } else {
      delete document.documentElement.dataset.dark
    }
    localStorage.setItem('theme', state.theme)
  }, [state.theme])

  // App-Sprache merken + Schreibrichtung (RTL für Arabisch/Hebräisch/…)
  useEffect(() => {
    localStorage.setItem('lang', state.lang)
    document.documentElement.lang = state.lang
    document.documentElement.dir = isRTL(state.lang) ? 'rtl' : 'ltr'
  }, [state.lang])

  // Toast automatisch ausblenden (2.4 s wie im Prototyp)
  useEffect(() => {
    if (!state.toast) return
    const timer = setTimeout(() => dispatch({ type: 'hideToast' }), 2400)
    return () => clearTimeout(timer)
  }, [state.toast, dispatch])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
