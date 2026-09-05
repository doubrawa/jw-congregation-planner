/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from './context'
import { initialState } from './init'
import {
  buildDemoFsWeeks,
  buildDemoWeeks,
  CONGREGATION,
  DEMO_ABSENCES,
  DEMO_FS_RULES,
  DEMO_GROUPS,
  DEMO_MY_TASKS,
  DEMO_NOTIFICATIONS,
  DEMO_PERSONS,
  DEMO_SERVICES,
  FS_BASE,
} from '../data/testdaten'
import { setAbweichung } from '../data/meeting-edit'
import { setAnlass } from '../data/anlass'
import { syncAuxSlots } from '../data/aux-class'
import type { S89Payload, Screen, Week } from '../data/types'

/**
 * **React sagt Bescheid — bloß hörte niemand hin.**
 *
 * React meldet doppelte `key`s, ungültige Verschachtelung, den Wechsel zwischen
 * kontrolliertem und unkontrolliertem Feld und ein Dutzend weiterer
 * Bauartfehler über `console.error`. Im Testlauf rauschen sie durch: Vitest
 * zeigt sie an, aber nichts schlägt fehl. Genau deshalb sind sie ein guter
 * Fang — sie stehen für Fehler, die niemand gesucht hat.
 *
 * Hier wird die ganze Oberfläche einmal durchgezeichnet — jeder Bildschirm,
 * jede Überlagerung, dazu die Wochen, die von der Regel abweichen — und **jede**
 * Meldung auf der Konsole lässt den Lauf platzen.
 *
 * Bewusst breit statt tief: Der Test weiß nichts über die einzelnen Bausteine,
 * er hält nur eine Zusicherung, die für alle gilt. Kommt ein Bildschirm dazu,
 * genügt eine Zeile in `LAGEN`.
 */

vi.mock('./hydrate', () => ({ loadAndHydrate: () => Promise.resolve() }))
vi.mock('../lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  performLogout: () => {},
}))

const { AppShell } = await import('./AppShell')

// jsdom kennt `matchMedia` nicht; die Wisch-Gesten fragen danach.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

const S89: S89Payload = {
  name: 'Xavo Quintus',
  partner: '',
  date: 'Dienstag, 8. September · 19:00',
  type: 'Bibellesung',
  point: 'th Lektion 2',
  aux: false,
}

function zustand(over: Partial<AppState> = {}): AppState {
  return {
    ...initialState(),
    dataStatus: 'ready',
    dataEmpty: false,
    congregationId: 'c1',
    userId: 'u1',
    personId: DEMO_PERSONS[0]!.id,
    planner: true,
    congregation: { ...CONGREGATION },
    persons: [...DEMO_PERSONS],
    groups: [...DEMO_GROUPS],
    services: [...DEMO_SERVICES],
    weeks: buildDemoWeeks(),
    fsWeeks: buildDemoFsWeeks(),
    fsRules: [...DEMO_FS_RULES],
    fsBase: FS_BASE,
    absences: [...DEMO_ABSENCES],
    notifs: [...DEMO_NOTIFICATIONS],
    myTasks: [...DEMO_MY_TASKS],
    members: [{ userId: 'u1', personId: DEMO_PERSONS[0]!.id, planner: true, email: 'a@b.c' }],
    invites: [],
    week: 0,
    tab: 'mid',
    terminGewaehlt: true,
    ...over,
  }
}

function zeige(over: Partial<AppState> = {}) {
  const state = zustand(over)
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AppShell />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

const SCREENS: Screen[] = [
  'start', 'programm', 'aufgaben', 'planen', 'personen', 'einstellungen', 'profil',
]

/** Wochen, die von der Regel abweichen — dort entstehen die Sonderzweige. */
const mitAnlass = (art: 'co' | 'mem' | 'kongress'): Week[] =>
  setAnlass(buildDemoWeeks(), 0, art)

/** Jede Lage einmal: Bildschirm, Reiter, Überlagerung, Sonderwoche. */
const LAGEN: Array<[string, Partial<AppState>]> = [
  ...SCREENS.map((screen) => [`Bildschirm ${screen}`, { screen }] as [string, Partial<AppState>]),
  ...(['we', 'fs'] as const).map(
    (tab) => [`Programm · Reiter ${tab}`, { screen: 'programm' as Screen, tab }] as [string, Partial<AppState>],
  ),
  ['Planen · Wochenende', { screen: 'planen', tab: 'we' }],
  ['Planen · Predigtdienst', { screen: 'planen', tab: 'fs' }],
  // Überlagerungen — nur sichtbar, wenn man sie öffnet.
  ['Mitteilungen', { screen: 'start', notifOpen: true }],
  ['Aufgaben-Blatt', { screen: 'aufgaben', myTaskId: DEMO_MY_TASKS[0]?.id ?? '' }],
  ['Sprachauswahl', { screen: 'einstellungen', langSheetOpen: true }],
  ['Bestätigungs-Dialog', { screen: 'start', confirmOpen: true }],
  ['S-89-Formular', { screen: 'aufgaben', s89: S89 }],
  ['Dienst-Freigabe', { screen: 'einstellungen', svcSheet: DEMO_SERVICES[0]?.key ?? '' }],
  ['Personen-Detail', { screen: 'personen', selectedPersonId: DEMO_PERSONS[0]!.id }],
  // Sonderwochen: eigene Abschnitte, eigene Banner, eigene Ausfälle.
  ['Kreisaufseher-Woche', { screen: 'planen', weeks: mitAnlass('co') }],
  ['Gedächtnismahl-Woche', { screen: 'programm', weeks: mitAnlass('mem') }],
  ['Kongress-Woche', { screen: 'programm', weeks: mitAnlass('kongress') }],
  [
    'Ausgefallene Zusammenkunft',
    {
      screen: 'planen',
      weeks: setAbweichung(buildDemoWeeks(), 0, 'mid', { cancelled: true, reason: 'Saal belegt' }),
    },
  ],
  ['Zusätzliche Klasse', { screen: 'planen', weeks: syncAuxSlots(buildDemoWeeks(), true), auxClass: true }],
  // Zustände ohne Daten und ohne Rechte — beide zeichnen andere Zweige.
  ['Ohne Wochen', { screen: 'programm', weeks: [], fsWeeks: [] }],
  ['Kein Planer', { screen: 'aufgaben', planner: false }],
  ['Offline-Stand', { screen: 'start', staleAt: Date.now() - 7200_000 }],
]

describe('Die Oberfläche zeichnet ohne eine einzige Konsolenmeldung', () => {
  let meldungen: string[] = []

  beforeEach(() => {
    meldungen = []
    const sammeln = (...args: unknown[]) => {
      meldungen.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '))
    }
    vi.spyOn(console, 'error').mockImplementation(sammeln)
    vi.spyOn(console, 'warn').mockImplementation(sammeln)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it.each(LAGEN)('%s', (_name, over) => {
    const { container } = zeige(over)
    // Gegenprobe: Ein leerer Bildschirm meldet nichts und bewiese nichts.
    expect(container.textContent?.length ?? 0, 'nichts gezeichnet').toBeGreaterThan(20)
    expect(meldungen, meldungen.join('\n---\n')).toEqual([])
  })
})
