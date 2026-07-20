/**
 * Startzustand der App: Demo-Modus (ohne Supabase-Konfiguration) mit den
 * festen Demo-Daten, sonst leerer Zustand bis zur Hydration nach dem Login.
 * Dazu die localStorage-Wiederherstellung (Theme, Sprache) und der
 * Dev-Debug-Hash für Headless-Screenshots.
 */

import {
  buildDemoWeeks,
  CONGREGATION,
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
import { THEME_LIST } from '../data/constants'
import { APP_LANGS } from '../i18n/langs'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Lang, Screen, Theme } from '../data/types'
import type { AppState } from './context'

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

export function initialState(): AppState {
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
