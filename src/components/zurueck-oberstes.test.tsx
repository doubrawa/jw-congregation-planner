/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
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
 * **Die Zurück-Taste schließt das oberste Blatt, nicht den ganzen Stapel.**
 *
 * Der Kopf von `useBackDismiss` behauptet: „Mehrere Overlays übereinander
 * funktionieren von selbst, weil jedes seinen eigenen Eintrag mitbringt —
 * Zurück schließt sie der Reihe nach von oben." Für die **Verlaufseinträge**
 * stimmt das; die Horcher hängen aber alle am selben Fenster, und ein
 * `popstate` erreicht jeden einzelnen.
 *
 * Auf dem Handy ist Zurück die meistgenutzte Geste überhaupt. Wer sich das
 * S-89-Formular ansieht und zurückgeht, landet damit nicht bei der Zuteilung,
 * aus der er kam, sondern im Plan.
 *
 * **Eine eigene Datei**, weil `useBackDismiss` seinen Stapel modulweit führt:
 * Der synthetische Rückschritt hier soll auf genau die beiden Blätter treffen,
 * die dieser Test aufgebaut hat, und auf keine Reste aus einer anderen Datei.
 *
 * Hier stand als Grund einmal etwas anderes: Ein früheres Abmelden lasse „ein
 * `popstate` offen", der erste Rückschritt dieser Datei müsse deshalb der erste
 * des Moduls sein. Das war kein Testaufbau, sondern der Fehler selbst — die
 * Ankündigung des eigenen Aufräumens verfiel nie und verschluckte den nächsten
 * Zurück-Druck. Sie verfällt jetzt von selbst (`zurueck-zaehler.test.tsx`).
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

describe('Zwei Blätter übereinander: die Zurück-Taste', () => {
  it('und die Zurück-Taste ebenso — sie schließt nur das oberste', () => {
    /*
      Der Kopf von `useBackDismiss` behauptet: „Mehrere Overlays übereinander
      funktionieren von selbst, weil jedes seinen eigenen Eintrag mitbringt —
      Zurück schließt sie der Reihe nach von oben." Das gilt für die
      Verlaufseinträge; die **Horcher** hängen aber alle am selben Fenster, und
      ein `popstate` erreicht jeden. Auf dem Handy ist Zurück die meistgenutzte
      Geste überhaupt — dort fiel damit der ganze Stapel auf einmal weg.
    */
    const { gerufen } = zeige({ ...ZUTEILUNG, s89: S89 })
    window.dispatchEvent(new PopStateEvent('popstate'))
    const arten = gerufen.map((a) => a.type)
    expect(arten).toContain('closeS89')
    expect(arten, 'die Zuteilung darunter wurde mit weggeräumt').not.toContain('closeSlot')
  })

})
