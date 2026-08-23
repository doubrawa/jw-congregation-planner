/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useAppSelector,
  useAppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { buildDemoWeeks } from '../data/testdaten'
import { WeekStrip } from './WeekStrip'

/**
 * Die Vorschau zeigt die Nachbarwochen — und überschreibt dafür den Zustand
 * für ihren Teilbaum.
 *
 * Seit es Selektoren gibt (T41), reicht der Kontext dafür nicht mehr: sie lesen
 * am Kontext vorbei, aus dem Speicher. Wäre nur der Kontext überschrieben,
 * läse derselbe Baustein die Nachbarwoche über `useAppState` und die aktuelle
 * über `useAppSelector` — zwei Wochen gleichzeitig in einer Ansicht. Genau die
 * Sorte Fehler, die nicht auffällt, weil sie nichts wirft.
 */

function Buehne({ state, children }: { state: AppState; children: ReactNode }) {
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

/** Zeigt, welche Woche die beiden Lesewege sehen. */
function ZeigtWoche() {
  const ausKontext = useAppState().week
  const ausSpeicher = useAppSelector((s) => s.week)
  return <span data-testid="woche">{`${ausKontext}|${ausSpeicher}`}</span>
}

// Die Wischgeste fragt zuerst, ob wir am Schreibtisch sitzen — hier: nein.
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

describe('Wochen-Vorschau', () => {
  const weeks = buildDemoWeeks()
  // Woche 1 von dreien: links und rechts steht je eine Nachbarwoche.
  const state: AppState = { ...initialState(), weeks, week: 1 }

  it('beide Lesewege sehen in jeder Vorschau dieselbe Woche', () => {
    const { getAllByTestId } = render(
      <Buehne state={state}>
        <WeekStrip>
          <ZeigtWoche />
        </WeekStrip>
      </Buehne>,
    )
    const gesehen = getAllByTestId('woche').map((el) => el.textContent)
    // Reihenfolge im Streifen: vorige | aktuelle | nächste.
    expect(gesehen).toEqual(['0|0', '1|1', '2|2'])
  })

  it('am Rand entfällt die jeweilige Vorschau', () => {
    const { getAllByTestId } = render(
      <Buehne state={{ ...state, week: 0 }}>
        <WeekStrip>
          <ZeigtWoche />
        </WeekStrip>
      </Buehne>,
    )
    expect(getAllByTestId('woche').map((el) => el.textContent)).toEqual(['0|0', '1|1'])
  })
})

/**
 * **Der Streifen übernimmt das Wischen.** Die Geste selbst ist in
 * `gestures.test.tsx` an 25 Fällen geprüft — hier zählt nur, dass der Streifen
 * sie mit den richtigen Aktionen und Grenzen verdrahtet, und dass die
 * **Vorschau nichts auslöst**: Sie zeichnet dieselben Bausteine mit fremdem
 * Zustand, und ein Tipp darin änderte sonst die falsche Woche.
 */
describe('Der Streifen verdrahtet die Wischgeste', () => {
  /** Berührungs-Ereignis wie in gestures.test.tsx — jsdom kennt keine Touches. */
  const touch = (el: Element, type: string, punkte: Array<[number, number]>, zeit = 0) => {
    const e = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>
    const liste = punkte.map(([x, y]) => ({ clientX: x, clientY: y }))
    e.touches = type === 'touchend' ? [] : liste
    e.changedTouches = liste
    Object.defineProperty(e, 'timeStamp', { value: zeit })
    el.dispatchEvent(e)
  }

  const wischen = (el: Element, vonX: number, nachX: number) => {
    touch(el, 'touchstart', [[vonX, 300]], 0)
    for (let i = 1; i <= 4; i++) {
      touch(el, 'touchmove', [[vonX + ((nachX - vonX) * i) / 4, 300]], (200 * i) / 4)
    }
    touch(el, 'touchend', [[nachX, 300]], 200)
    vi.advanceTimersByTime(600) // Nachlauf-Animation zu Ende
  }

  function streifen(state: AppState) {
    const dispatch = vi.fn()
    function Buehne() {
      const store = useStaticStore(state)
      return (
        <AppDispatchContext.Provider value={dispatch}>
          <AppStoreContext.Provider value={store}>
            <AppStateContext.Provider value={state}>
              <WeekStrip>
                <ZeigtWoche />
              </WeekStrip>
            </AppStateContext.Provider>
          </AppStoreContext.Provider>
        </AppDispatchContext.Provider>
      )
    }
    return { dispatch, ...render(<Buehne />) }
  }

  const weeks = buildDemoWeeks()

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('nach links wischen blättert vorwärts', () => {
    const { container, dispatch } = streifen({ ...initialState(), weeks, week: 1 })
    wischen(container.querySelector('.week-viewport')!, 300, 100)
    expect(dispatch).toHaveBeenCalledWith({ type: 'nextWeek' })
  })

  it('nach rechts zurück', () => {
    const { container, dispatch } = streifen({ ...initialState(), weeks, week: 1 })
    wischen(container.querySelector('.week-viewport')!, 100, 300)
    expect(dispatch).toHaveBeenCalledWith({ type: 'prevWeek' })
  })

  it('an der letzten Woche passiert nichts — der Streifen kennt seine Grenzen', () => {
    const { container, dispatch } = streifen({ ...initialState(), weeks, week: weeks.length - 1 })
    wischen(container.querySelector('.week-viewport')!, 300, 100)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('die Vorschau löst nichts aus — sie zeichnet eine fremde Woche', () => {
    const { container, dispatch } = streifen({ ...initialState(), weeks, week: 1 })
    fireEvent.click(container.querySelector('.week-page--vor')!)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
