/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import {
  buildDemoWeeks,
  CONGREGATION,
  DEMO_GROUPS,
  DEMO_PERSONS,
  DEMO_SERVICES,
} from '../data/testdaten'
import type { S89Payload } from '../data/types'

/**
 * **Escape schließt das oberste Blatt, nicht den ganzen Stapel.**
 *
 * Das S-89-Formular wird **aus** dem Zuteilungs-Sheet heraus geöffnet, und
 * `openS89` lässt `slotSel` stehen — beide liegen danach übereinander. Beide
 * horchen mit `useEscape` am Fenster, und ein Tastendruck erreicht beide: Der
 * Planer sieht sich das Formular an, drückt Escape, um zurück zur Zuteilung zu
 * kommen — und steht wieder im Plan. Über das ✕ des Formulars kommt er dagegen
 * richtig zurück. Zwei Wege, zwei Ergebnisse.
 */

vi.mock('../app/hydrate', () => ({ loadAndHydrate: () => Promise.resolve() }))
vi.mock('../lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  performLogout: () => {},
}))

const { AppShell } = await import('../app/AppShell')

window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

afterEach(cleanup)

const S89: S89Payload = {
  name: 'Xavo Quintus',
  partner: '',
  date: 'Dienstag, 8. September · 19:00',
  type: 'Bibellesung',
  point: 'th Lektion 2',
  aux: false,
}

function zeige(over: Partial<AppState>) {
  const gerufen: AppAction[] = []
  const dispatch = (a: AppAction) => {
    gerufen.push(a)
  }
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready',
    congregationId: 'c1',
    userId: 'u1',
    personId: DEMO_PERSONS[0]!.id,
    planner: true,
    screen: 'planen',
    tab: 'mid',
    terminGewaehlt: true,
    congregation: { ...CONGREGATION },
    persons: [...DEMO_PERSONS],
    groups: [...DEMO_GROUPS],
    services: [...DEMO_SERVICES],
    weeks: buildDemoWeeks(),
    week: 0,
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <AppShell />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  const r = render(<Buehne />)
  return { ...r, gerufen }
}

/** Das Zuteilungs-Sheet, offen auf einem Programmpunkt. */
const ZUTEILUNG: Partial<AppState> = {
  slotSel: {
    kind: 'part',
    wi: 0,
    tab: 'mid',
    si: 1,
    ii: 0,
    ni: 0,
    label: 'Demoaufgabe',
    priv: null,
    groups: false,
  },
}

describe('Zwei Blätter übereinander', () => {
  it('Escape im S-89-Formular schließt nur dieses', () => {
    const { gerufen } = zeige({ ...ZUTEILUNG, s89: S89 })
    fireEvent.keyDown(window, { key: 'Escape' })
    const arten = gerufen.map((a) => a.type)
    expect(arten).toContain('closeS89')
    expect(arten, 'die Zuteilung darunter wurde mit weggeräumt').not.toContain('closeSlot')
  })

  it('… und das ✕ des Formulars ebenso — beide Wege führen zurück zur Zuteilung', () => {
    // Gegenprobe zur Zeile darüber: Über den Knopf war es schon immer richtig.
    const { container, gerufen } = zeige({ ...ZUTEILUNG, s89: S89 })
    const zu = container.querySelector<HTMLButtonElement>('.sheet--s89 .sheet-close')
    expect(zu, 'kein ✕ am S-89-Formular gefunden').not.toBeNull()
    fireEvent.click(zu!)
    const arten = gerufen.map((a) => a.type)
    expect(arten).toContain('closeS89')
    expect(arten).not.toContain('closeSlot')
  })

  it('ohne Formular schließt Escape das Zuteilungs-Sheet weiterhin', () => {
    // Sonst wäre die Absicherung oben ein Weg, Escape ganz abzuschalten.
    const { gerufen } = zeige(ZUTEILUNG)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(gerufen.map((a) => a.type)).toContain('closeSlot')
  })
})
