/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppAction, AppState } from '../app/context'

/**
 * **Planen rechnet nur neu, wenn sich ändert, was gelesen wird** (Review,
 * Planen #2 und #6, 16.10.2026).
 *
 * - Die **Kandidatenliste** rechnet je Kandidat Auslastung, Rangfolge und
 *   „zuletzt" über alle geladenen Wochen. Gemerkt war sie am ganzen Zustand:
 *   Ein Toast rechnete sie zweimal neu (zeigen, ausblenden), ein
 *   Farbschema-Wechsel einmal — und jeder Tastendruck im Ort eines
 *   Treffpunkts, solange die Spalte offen stand.
 * - Die **S-89-Zettel** rechnete der Bogen bei jedem Render, im Wochenstreifen
 *   dreimal.
 *
 * Geprüft am Planen-Bildschirm in voller Breite: Platz antippen, die Spalte
 * zeigt die Liste — dann Toast und Farbschema, und nichts wird neu gerechnet.
 * Die Gegenprobe ändert die Wochen, und beides wird neu gerechnet.
 */
vi.mock('../app/hydrate', () => ({ loadAndHydrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/supabase', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  supabase: null,
  isSupabaseConfigured: false,
}))
vi.mock('./kandidaten', async (orig) => {
  const echt = await orig<typeof import('./kandidaten')>()
  return { ...echt, kandidaten: vi.fn(echt.kandidaten) }
})
vi.mock('../data/planning', async (orig) => {
  const echt = await orig<typeof import('../data/planning')>()
  return { ...echt, alleS89DerWoche: vi.fn(echt.alleS89DerWoche) }
})

const { AppProvider } = await import('../app/store')
const { useApp } = await import('../app/context')
const { demoZustand } = await import('../../tests/testdaten/demo-start')
const { kandidaten } = await import('./kandidaten')
const { alleS89DerWoche } = await import('../data/planning')
const { PlanenScreen } = await import('./PlanenScreen')

const liste = vi.mocked(kandidaten)
const zettel = vi.mocked(alleS89DerWoche)

/** Breit genug für die Spalte zum Zuteilen neben dem Plan. */
function breit() {
  window.matchMedia = vi.fn((abfrage: string) => ({
    matches: abfrage === '(min-width: 1400px)' || abfrage === '(min-width: 1180px)' || abfrage === '(min-width: 768px)',
  })) as unknown as typeof window.matchMedia
}

let dispatch: (a: AppAction) => void = () => {}
/** Reicht den echten Dispatch nach draußen — Toast und Farbschema kommen von woanders. */
function Fernbedienung() {
  dispatch = useApp().dispatch
  return null
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 7, 9, 0)) // Montag, 7. September 2026
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Planen: gemerkt an dem, was gelesen wird', () => {
  it('Toast und Farbschema rechnen weder Kandidaten noch S-89-Zettel neu — neue Wochen beides', () => {
    breit()
    const anfang: AppState = { ...demoZustand(), screen: 'planen', tab: 'mid', dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true }
    const { container } = render(
      <AppProvider start={() => anfang}>
        <Fernbedienung />
        <PlanenScreen />
      </AppProvider>,
    )
    fireEvent.click(container.querySelector('.planen-raster-plan .platz')!)
    expect(liste).toHaveBeenCalled()
    expect(zettel).toHaveBeenCalled()
    expect(container.querySelector('.zuteilen-spalte .zuteilen-leer')).toBeNull()

    liste.mockClear()
    zettel.mockClear()
    act(() => dispatch({ type: 'showToast', text: 'Gespeichert' }))
    act(() => dispatch({ type: 'hideToast' }))
    act(() => dispatch({ type: 'setTheme', theme: 'dunkel' }))
    expect(liste).not.toHaveBeenCalled()
    expect(zettel).not.toHaveBeenCalled()

    act(() => dispatch({ type: 'clearAssignments', scope: 'all' }))
    expect(liste).toHaveBeenCalled()
    expect(zettel).toHaveBeenCalled()
  })
})
