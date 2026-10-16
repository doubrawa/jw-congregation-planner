/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppAction, AppState } from '../app/context'

/**
 * **Konflikte und Abwesenheiten: einmal je Zustand** (Review, Planen #1 und
 * App #9, 16.10.2026).
 *
 * Jeder Baustein des Planens rechnete beides für sich: der Plan, die
 * Hilfsdienste, der Ratgeber der zweiten Klasse, die Wochen-Spalte, die
 * Zusagen. Gemessen 24 Mal `weekConflicts` je Änderung der Wochen — und jede
 * Rechnung baut die Personen-Tabellen neu auf. Die Abwesenheiten liefen
 * dieselbe Strecke noch einmal, dazu im Reducer.
 *
 * Geprüft wird am Planen-Bildschirm mit dem echten Speicher, so breit, dass
 * alles nebeneinander steht (Wochen-Spalte, Plan, Zuteilen): Für einen Stand
 * der Wochen wird jede Zusammenkunft jeder Woche **einmal** gerechnet. Rechnet
 * ein Baustein wieder selbst — oder bekommt er eigene Abwesenheiten, und der
 * gemeinsame Speicher verwirft sich bei jedem Wechsel —, steht hier, welche
 * Woche wie oft lief.
 */
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/supabase', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  supabase: null,
  isSupabaseConfigured: false,
}))
vi.mock('../data/planning', async (orig) => {
  const echt = await orig<typeof import('../data/planning')>()
  return { ...echt, weekConflicts: vi.fn(echt.weekConflicts) }
})

const { AppProvider } = await import('../app/store')
const { useApp } = await import('../app/context')
const { demoZustand } = await import('../../tests/testdaten/demo-start')
const { weekConflicts } = await import('../data/planning')
const { abwesenheitenVon } = await import('../data/absence')
const { konflikteVon } = await import('./useKonflikte')
const { PlanenScreen } = await import('./PlanenScreen')

const gerechnet = vi.mocked(weekConflicts)

/** Breit genug für alles nebeneinander: Menü, Wochen-Spalte, Plan, Zuteilen. */
function breit() {
  window.matchMedia = vi.fn((abfrage: string) => ({
    matches: abfrage === '(min-width: 1400px)' || abfrage === '(min-width: 1180px)' || abfrage === '(min-width: 768px)',
  })) as unknown as typeof window.matchMedia
}

let dispatch: (a: AppAction) => void = () => {}
/** Reicht den echten Dispatch nach draußen — die Probe ändert die Wochen selbst. */
function Fernbedienung() {
  dispatch = useApp().dispatch
  return null
}

function zeigePlanen() {
  const anfang: AppState = { ...demoZustand(), screen: 'planen', tab: 'mid', dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true }
  render(
    <AppProvider start={() => anfang}>
      <Fernbedienung />
      <PlanenScreen />
    </AppProvider>,
  )
}

/**
 * Was für denselben Stand der Wochen mehr als einmal gerechnet wurde — als
 * „Stand · Woche · Zusammenkunft ×Anzahl". Der Stand ist das Wochen-Objekt:
 * Ändert sich etwas, entsteht ein neues, und neu rechnen ist dann richtig.
 */
function doppeltGerechnet(): string[] {
  const stand = new Map<unknown, number>()
  const je = new Map<string, number>()
  for (const [weeks, wi, , , tab] of gerechnet.mock.calls) {
    if (!stand.has(weeks)) stand.set(weeks, stand.size)
    const k = `${stand.get(weeks)} · ${wi} · ${tab ?? 'alle'}`
    je.set(k, (je.get(k) ?? 0) + 1)
  }
  return [...je].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
  gerechnet.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Konflikte: einmal je Zustand', () => {
  it('der Planen-Bildschirm rechnet jede Zusammenkunft einmal — beim Öffnen und nach einer Änderung', () => {
    breit()
    zeigePlanen()
    expect(gerechnet).toHaveBeenCalled()
    expect(doppeltGerechnet()).toEqual([])

    gerechnet.mockClear()
    act(() => dispatch({ type: 'clearAssignments', scope: 'all' }))
    // Die Wochen sind neu — gerechnet wird wieder, aber wieder nur einmal.
    expect(gerechnet).toHaveBeenCalled()
    expect(doppeltGerechnet()).toEqual([])
  })

  it('dieselben Eingaben ergeben dasselbe Objekt, neue Wochen ein neues', () => {
    // Darauf beruht die Messung oben: Die Bausteine vergleichen Referenzen
    // (`useMemo`), und erst dasselbe Objekt erspart ihnen die Arbeit.
    const s = demoZustand()
    const abwesend = abwesenheitenVon(s.absences, s.weeks, s.congregation.times)
    expect(abwesenheitenVon(s.absences, s.weeks, s.congregation.times)).toBe(abwesend)
    const mitte = konflikteVon(s.weeks, 0, s.persons, s.services, 'mid', abwesend)
    expect(konflikteVon(s.weeks, 0, s.persons, s.services, 'mid', abwesend)).toBe(mitte)
    expect(konflikteVon(s.weeks, 0, s.persons, s.services, 'we', abwesend)).not.toBe(mitte)

    const neueWochen = [...s.weeks]
    expect(abwesenheitenVon(s.absences, neueWochen, s.congregation.times)).not.toBe(abwesend)
    expect(konflikteVon(neueWochen, 0, s.persons, s.services, 'mid', abwesend)).not.toBe(mitte)
  })
})
