/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { PersonTimeline } from './PersonTimeline'

/**
 * **Die Zeitleiste einer Person rückt um Mitternacht weiter** (16.10.2026).
 *
 * Was vergangen ist, wurde beim Rechnen festgestellt — und gerechnet wurde nur
 * neu, wenn sich Person oder Zustand änderten. Wer die Person über Mitternacht
 * offen hatte, sah den gestrigen Termin weiter als kommenden.
 */

function zeige(state: AppState) {
  const person = state.persons.find((p) => p.id === 'p1')!
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PersonTimeline person={person} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return render(<Buehne />)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PersonTimeline', () => {
  it('was heute ist, steht ab Mitternacht als vergangen da — auch ohne andere Änderung', () => {
    vi.useFakeTimers()
    // Dienstag, 8. September 2026, kurz vor Mitternacht. Der Demo-Bestand hat
    // an diesem Tag den Vorsitz von p1 (Woche ab 7. September).
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 30))
    const { container } = zeige({ ...demoZustand(), dataStatus: 'ready' })
    const vergangen = () => container.querySelectorAll('.zeit li.is-past').length
    const vorher = vergangen()
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })
    expect(vergangen()).toBeGreaterThan(vorher)
  })
})
