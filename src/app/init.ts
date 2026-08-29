/**
 * Startzustand der App: Demo-Modus (ohne Supabase-Konfiguration) mit den
 * festen Demo-Daten, sonst leerer Zustand bis zur Hydration nach dem Login.
 * Dazu die localStorage-Wiederherstellung (Theme, Sprache) und der
 * Dev-Debug-Hash für Headless-Screenshots.
 */
import { montagDieserWoche } from '../data/fs'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_ABSENCES,
  DEMO_FS_RULES,
  FS_BASE,
  DEMO_MY_TASKS,
  DEMO_NOTIFICATIONS,
  DEMO_PENDING_IDS,
  DEMO_GROUPS,
  DEMO_PERSONS,
  DEMO_PLANNER,
  DEMO_SERVICES,
} from '../data/testdaten'
import { STANDARD_ERINNERUNGEN } from '../data/vorgaben'
import { asFontScale, DEFAULT_FONT_SCALE, THEME_LIST, type FontScale } from '../data/constants'
import { APP_LANGS } from '../i18n/langs'
import { isSupabaseConfigured } from '../lib/supabase'
import type { Lang, MeetingTab, Screen, Theme } from '../data/types'
import type { AppState } from './context'
/** Alte gespeicherte Werte (vor den 8 Farbschemata) auf Paletten mappen. */
const LEGACY_THEME: Record<string, Theme> = { light: 'weiss', dark: 'graphit' }
function asTheme(value: string | null): Theme | null {
  if (!value) return null
  if (LEGACY_THEME[value]) return LEGACY_THEME[value]
  return THEME_LIST.some((t) => t.key === value) ? (value as Theme) : null
}
function getInitialTheme(): Theme {
  // Standard ist Reinweiß, unabhängig von der System-Einstellung (dunkler
  // Modus). Ein anderes Design wählt man im Profil; die Wahl wird gespeichert.
  return asTheme(localStorage.getItem('theme')) ?? 'weiss'
}
function getInitialFontScale(): FontScale {
  return asFontScale(localStorage.getItem('fontScale')) ?? DEFAULT_FONT_SCALE
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
interface DebugHash {
  screen?: Screen
  lang?: Lang
  congLang?: string
  theme?: Theme
  fontScale?: FontScale // fs=<Faktor> — Schriftgrößen-Stufe für Doku-Screenshots
  personId?: string
  /**
   * `me=<Person-Id>` — **wessen** App das hier ist (`state.personId`).
   *
   * Nicht dasselbe wie `p=`: Das wählt eine Person im Personen-Screen aus
   * (`selectedPersonId`), das hier meldet einen an. Im Demo-Modus gehört die
   * App sonst niemandem, und alles, was von der eigenen Person abhängt, ist
   * nicht anzusehen: der DU-Chip, „Deine Einträge" — und die
   * Treffpunkte der **eigenen** Predigtdienstgruppe.
   */
  me?: string
  tab?: MeetingTab // Programm/Planen-Tab (mid|we|fs) — für Doku-Screenshots
  planner?: boolean // Rechte erzwingen (pl=0 Verkündiger, pl=1 Planer)
  shot?: boolean // Screenshot-Modus: Spaltenschatten aus (randloses Zuschneiden)
  staleAt?: number // Offline-Stand vortäuschen (stale=<Stunden alt>) — Banner + nur lesen
}
function parseDebugHash(): DebugHash | null {
  const raw = location.hash.replace(/^#/, '')
  if (!raw) return null
  const p = new URLSearchParams(raw)
  const out: DebugHash = {}
  const s = p.get('s')
  if (s) out.screen = s as Screen
  const l = p.get('l')
  if (l) out.lang = l as Lang
  const c = p.get('c')
  if (c) out.congLang = c
  const th = asTheme(p.get('t'))
  if (th) out.theme = th
  const fs = asFontScale(p.get('fs'))
  if (fs) out.fontScale = fs
  const person = p.get('p')
  if (person) out.personId = person
  const me = p.get('me')
  if (me) out.me = me
  const tab = p.get('tab')
  if (tab === 'mid' || tab === 'we' || tab === 'fs') out.tab = tab
  const pl = p.get('pl')
  if (pl === '0' || pl === '1') out.planner = pl === '1'
  if (p.get('shot') === '1') out.shot = true
  // stale=<Stunden>: Offline-Stand simulieren (ohne Netzabbruch nachstellbar)
  const stale = Number(p.get('stale'))
  if (Number.isFinite(stale) && stale > 0) out.staleAt = Date.now() - stale * 3600_000
  return Object.keys(out).length ? out : null
}
export function initialState(): AppState {
  // Konfiguriert (Supabase): leerer Start, Daten kommen per Hydration nach dem
  // Login. Demo-Modus: In-Memory-Demo-Daten wie bisher. Ein Debug-Hash erzwingt
  // im Dev-Build zusätzlich den Demo-Modus (Daten sofort da, ohne Login/Netz).
  const debug = import.meta.env.DEV ? parseDebugHash() : null
  // **Nur im Dev-Build.** Bis zum 13. August 2026 stand hier bloß
  // `!isSupabaseConfigured || debug != null` — ein Laufzeitwert, an dem der
  // Bündler nichts entscheiden kann. Die Testdaten landeten deshalb im
  // ausgelieferten Bündel, obwohl sie dort nie zum Einsatz kamen (die
  // veröffentlichte Seite hat Supabase konfiguriert). Mit `import.meta.env.DEV`
  // fällt der ganze Zweig beim Bauen weg — geprüft in `bundle.test.ts`.
  const demo = import.meta.env.DEV && (!isSupabaseConfigured || debug != null)
  // Screenshot-Modus (nur DEV): Spaltenschatten per Attribut abschalten, damit
  // die Doku-Screenshots randlos zugeschnitten werden können (siehe shell.css).
  if (debug?.shot) document.documentElement.dataset.shot = '1'
  return {
    screen: debug?.screen ?? 'login',
    week: 0,
    tab: debug?.tab ?? 'mid',
    theme: debug?.theme ?? getInitialTheme(),
    fontScale: debug?.fontScale ?? getInitialFontScale(),
    planner: debug?.planner ?? (demo ? DEMO_PLANNER : false),
    congregation: demo ? { ...CONGREGATION } : { name: '', hall: '', meetings: '' },
    congregationId: null,
    userId: null,
    // Im Demo-Modus gehört die App niemandem — außer der Debug-Hash meldet
    // jemanden an (`me=`, nur DEV; siehe DebugHash).
    personId: (demo && debug?.me) || null,
    dataStatus: demo ? 'demo' : 'ready',
    dataEmpty: false,
    staleAt: debug?.staleAt ?? null,
    members: [],
    invites: [],
    recovery: false,
    weeks: demo ? buildDemoWeeks() : [],
    persons: demo ? DEMO_PERSONS : [],
    services: demo ? DEMO_SERVICES : [],
    groups: demo ? DEMO_GROUPS : [],
    fsRules: demo ? DEMO_FS_RULES : [],
    fsWeeks: demo ? buildDemoFsWeeks() : [],
    fsBase: demo ? FS_BASE : montagDieserWoche(new Date()),
    absences: demo ? DEMO_ABSENCES : [],
    notifs: demo ? DEMO_NOTIFICATIONS : [],
    notifOpen: false,
    slotSel: null,
    selectedPersonId: debug?.personId ?? null,
    importing: false,
    imported: false,
    myTasks: demo ? DEMO_MY_TASKS : [],
    pendingIds: demo ? DEMO_PENDING_IDS : [],
    confirmations: {},
    sentLog: {},
    confirmOpen: false,
    myTaskId: null,
    substituteReqs: [],
    s89: null,
    reminders: STANDARD_ERINNERUNGEN,
    lang: debug?.lang ?? getInitialLang(),
    langSheetOpen: false,
    langSheetFor: 'cong',
    svcSheet: null,
    // Ein Debug-Hash mit `tab=` ist eine Wahl — sonst spränge der Reiter beim
    // ersten Navigieren weg und die Doku-Screenshots zeigten das Falsche.
    terminGewaehlt: debug?.tab != null,
    auxClass: false,
    congLang: debug?.congLang ?? 'Deutsch',
    progLangs: [],
    langSearch: '',
    toast: null,
    welcomePending: false,
  }
}
