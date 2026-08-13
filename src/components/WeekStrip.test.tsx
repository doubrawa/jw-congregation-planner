/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
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
