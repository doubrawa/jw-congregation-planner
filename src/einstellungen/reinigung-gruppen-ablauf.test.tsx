/** @vitest-environment jsdom */
import { useReducer } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { reducer } from '../app/reducer'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { KEINE_ABWESENHEIT } from '../data/absence'
import type { SlotSelection, Week } from '../data/types'
import { neuerPlan } from '../data/weitere-plaene'
import { DE } from '../i18n/de'
import { fill } from '../i18n/useT'
import { kandidaten } from '../planen/kandidaten'
import { HilfsdienstBlatt } from './HilfsdienstBlatt'

/**
 * **Anwendungsfall (18.10.2026):** Der Admin tippt in den Einstellungen auf
 * die Reinigung, und es stehen alle Gruppen da, je mit Schalter — wie bei den
 * übrigen Hilfsdiensten die Personen. Er schaltet Gruppe 2 ab. Von da an
 * reinigt sie nicht mehr: „Automatisch" überspringt sie Woche für Woche, beim
 * Zuteilen steht sie nicht zur Wahl, und in den Weiteren Plänen verteilt
 * „Beginnen mit" die Wochen des Königreichssaals ohne sie. Schaltet er sie
 * wieder an, ist sie wieder dabei.
 *
 * Durch das echte Blatt und den echten Reducer — der Schalter muss bis in die
 * Rotation wirken, nicht nur im Blatt umspringen.
 */

vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

// Das Blatt lässt sich nach unten wegwischen; die Geste fragt zuerst, ob wir am
// Schreibtisch sitzen. jsdom kennt matchMedia nicht — hier: kein Schreibtisch.
window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia

afterEach(cleanup)

/** Die Demo-Versammlung (vier Gruppen) mit leerer Reinigung in allen Wochen — zu verteilen ist alles. */
function ohneReinigung(): AppState {
  const demo = demoZustand()
  const leer = (w: Week): Week => ({
    ...w,
    mid: { ...w.mid, helpers: { ...w.mid.helpers, rein: [] } },
    we: { ...w.we, helpers: { ...w.we.helpers, rein: [] } },
  })
  return { ...demo, dataStatus: 'ready', planner: true, weeks: demo.weeks.map(leer) }
}

/** Das Blatt der Reinigung über dem echten Reducer — `zustand()` liest, was die Schalter angerichtet haben. */
function blattDerReinigung(start: AppState) {
  let aktuell = start
  function Buehne() {
    const [state, dispatch] = useReducer(reducer, start)
    aktuell = state
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <HilfsdienstBlatt svcKey="rein" />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  const { container } = render(<Buehne />)
  const schalter = (name: string) => container.querySelector<HTMLElement>(`[role="switch"][aria-label="${name}"]`)!
  return { container, schalter, zustand: () => aktuell }
}

/** Wen „Automatisch" in jeder Woche zur Reinigung einteilt (Hilfsdienste, ganze Woche). */
function automatisch(state: AppState): string[] {
  return state.weeks.map((_w, wi) => {
    const nachher = reducer({ ...state, week: wi }, { type: 'autoAssign', scope: 'helpers', umfang: 'woche' })
    return nachher.weeks[wi]?.mid.helpers.rein?.[0]?.name ?? ''
  })
}

/** Was das Zuteilen-Blatt am Platz der Reinigung zur Wahl stellt. */
function zurWahl(state: AppState): string[] {
  const sel: SlotSelection = {
    kind: 'helper', wi: 0, tab: 'mid', svc: 'rein', pos: 0, priv: null, groups: true, label: 'Reinigung',
  }
  return kandidaten(state, sel, KEINE_ABWESENHEIT, DE, (s) => s).map((c) => c.name)
}

/** Wen „Beginnen mit Gruppe 1" in einem Plan des Königreichssaals einteilt — ein Vierteljahr ab dieser Woche. */
function imKoenigreichssaal(state: AppState): string[] {
  const plan = neuerPlan('pl-saal', new Date())
  const vorher: AppState = { ...state, plaene: [plan], planEintraege: [] }
  const nachher = reducer(vorher, { type: 'wpGruppenVerteilen', planId: plan.id, abGruppe: state.groups[0]!.id })
  return nachher.planEintraege.map((e) => state.groups.find((g) => g.id === e.grp)?.name ?? '')
}

describe('Gruppe 2 aus der Reinigung nehmen — und wieder hinein', () => {
  it('vorher reinigen alle vier reihum, und alle stehen zur Wahl', () => {
    const vorher = ohneReinigung()
    expect(new Set(automatisch(vorher))).toEqual(new Set(['Gruppe 1', 'Gruppe 2', 'Gruppe 3', 'Gruppe 4']))
    expect(zurWahl(vorher)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 3', 'Gruppe 4'])
    expect(imKoenigreichssaal(vorher).slice(0, 4)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 3', 'Gruppe 4'])
  })

  it('abgeschaltet reinigt sie in keiner Woche mehr und steht beim Zuteilen nicht zur Wahl', () => {
    const { container, schalter, zustand } = blattDerReinigung(ohneReinigung())
    expect(container.querySelector('.sheet-sub')?.textContent).toBe(`${DE.gruppenRotation} · ${fill(DE.gruppenN, { n: 4 })}`)

    fireEvent.click(schalter('Gruppe 2'))

    expect(schalter('Gruppe 2').getAttribute('aria-checked')).toBe('false')
    expect(container.querySelector('.sheet-sub')?.textContent).toBe(`${DE.gruppenRotation} · ${fill(DE.gruppenN, { n: 3 })}`)
    const folge = automatisch(zustand())
    expect(folge).not.toContain('Gruppe 2')
    expect(new Set(folge)).toEqual(new Set(['Gruppe 1', 'Gruppe 3', 'Gruppe 4']))
    expect(zurWahl(zustand())).toEqual(['Gruppe 1', 'Gruppe 3', 'Gruppe 4'])
    expect(imKoenigreichssaal(zustand()).slice(0, 4)).toEqual(['Gruppe 1', 'Gruppe 3', 'Gruppe 4', 'Gruppe 1'])
  })

  it('wieder angeschaltet ist sie wieder dabei — in der Rotation wie in der Wahl', () => {
    const { schalter, zustand } = blattDerReinigung(ohneReinigung())
    fireEvent.click(schalter('Gruppe 2'))
    fireEvent.click(schalter('Gruppe 2'))

    expect(schalter('Gruppe 2').getAttribute('aria-checked')).toBe('true')
    expect(automatisch(zustand())).toContain('Gruppe 2')
    expect(zurWahl(zustand())).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 3', 'Gruppe 4'])
    expect(imKoenigreichssaal(zustand()).slice(0, 2)).toEqual(['Gruppe 1', 'Gruppe 2'])
  })

  it('die übrigen Gruppen behalten ihren Schalter — einer schaltet genau seine Gruppe', () => {
    const { schalter, zustand } = blattDerReinigung(ohneReinigung())
    fireEvent.click(schalter('Gruppe 3'))
    expect(zustand().groups.map((g) => Boolean(g.ohneReinigung))).toEqual([false, false, true, false])
  })
})
