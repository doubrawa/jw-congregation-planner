/**
 * App-Context: State-Form, Actions und der useApp()-Hook.
 * Der Provider (Reducer + Effekte) liegt in store.tsx.
 */

import { createContext, useContext, type Dispatch } from 'react'
import type {
  Absence,
  Lang,
  MeetingTab,
  MyTask,
  Notification,
  Person,
  Reminders,
  S89Payload,
  Screen,
  Service,
  SlotSelection,
  Theme,
  Week,
} from '../data/types'

export interface Toast {
  id: number // erzwingt Neustart des Auto-Hide-Timers bei gleichem Text
  text: string
}

export interface AppState {
  screen: Screen
  week: number // Index in weeks
  tab: MeetingTab
  theme: Theme
  planner: boolean // Demo-Rechte: Planen/Personen/Einstellungen sichtbar
  weeks: Week[]
  persons: Person[]
  services: Service[]
  absences: Absence[]
  notifs: Notification[]
  notifOpen: boolean
  slotSel: SlotSelection | null // offenes Zuteilungs-Sheet (Planen)
  selectedPersonId: string | null // offenes Personen-Detail
  importing: boolean // Programm-Import läuft (~0.9 s)
  imported: boolean // alle verfügbaren Wochen importiert
  // Persönliche Aufgaben & Bestätigungs-Flow
  myTasks: MyTask[]
  pendingNames: string[] // Namen mit noch offener Bestätigung (Planen: „…“)
  confirmOpen: boolean // Bestätigungs-Modal beim Öffnen der App
  s89: S89Payload | null // offenes S-89-Formular
  reminders: Reminders
  // Mehrsprachigkeit
  lang: Lang // App-Sprache (UI)
  congLang: string // Versammlungssprache (deutscher Name, z. B. "Deutsch")
  langSheetOpen: boolean // Sprach-Sheet (Versammlungssprache) offen
  langSearch: string
  toast: Toast | null
}

export type LacDir = -1 | 1
export type ReminderKey = 'first' | 'last'

export type AppAction =
  | { type: 'login' }
  | { type: 'logout' }
  | { type: 'navigate'; screen: Screen }
  | { type: 'prevWeek' }
  | { type: 'nextWeek' }
  | { type: 'setTab'; tab: MeetingTab }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'openNotifs' }
  | { type: 'closeNotifs' }
  | { type: 'markAllRead' }
  | { type: 'openSlot'; sel: SlotSelection }
  | { type: 'closeSlot' }
  | { type: 'addAbsence'; absence: Absence }
  | { type: 'removeAbsence'; id: string }
  | { type: 'selectPerson'; id: string | null }
  | { type: 'addPerson'; person: Person } // öffnet direkt das Detail
  | { type: 'updatePerson'; id: string; patch: Partial<Person> }
  | { type: 'savePerson' } // zurück zur Liste + Toast (Daten sind live editiert)
  | { type: 'changeServiceCount'; key: string; delta: 1 | -1 }
  | { type: 'removeService'; key: string }
  | { type: 'addService'; service: Service }
  | { type: 'startImport' }
  | { type: 'finishImport' }
  | { type: 'assign'; name: string } // auf state.slotSel; "" = entfernen
  | { type: 'autoAssign' } // aktuelle Woche + Tab
  // Bestätigungs-Flow
  | { type: 'confirmTask'; id: string }
  | { type: 'declineTask'; id: string }
  | { type: 'openS89'; payload: S89Payload }
  | { type: 'closeS89' }
  // LAC-Bearbeitung (Planen, aktuelle Woche + Tab)
  | { type: 'lacAdjust'; si: number; ii: number; delta: number }
  | { type: 'lacRemove'; si: number; ii: number }
  | { type: 'lacMove'; si: number; ii: number; dir: LacDir }
  | { type: 'lacAdd'; si: number; title: string }
  // Erinnerungen
  | { type: 'changeReminder'; key: ReminderKey; delta: 1 | -1 }
  | { type: 'toggleReminderRepeat' }
  // Sprache
  | { type: 'setLang'; lang: Lang }
  | { type: 'openLangSheet' }
  | { type: 'closeLangSheet' }
  | { type: 'setLangSearch'; text: string }
  | { type: 'setCongLang'; name: string }
  | { type: 'showToast'; text: string }
  | { type: 'hideToast' }

export interface AppContextValue {
  state: AppState
  dispatch: Dispatch<AppAction>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp() außerhalb von <AppProvider> aufgerufen')
  return ctx
}
