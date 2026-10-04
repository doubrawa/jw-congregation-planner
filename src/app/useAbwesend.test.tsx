/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from './context'
import { useAbwesend } from './useAbwesend'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { istAbwesend } from '../data/absence'
import type { Week } from '../data/types'

/**
 * **Wer nicht zur Verfügung steht** — die eine Antwort für Zuteilungs-Blatt,
 * Engpass-Banner und Konfliktprüfung.
 */

const leer = { date: '', end: '', helpers: {}, sections: [] }
const WOCHE: Week = { range: '', book: '', start: '2026-09-07', mid: { ...leer }, we: { ...leer } }

/** Fehlt p4 am Sonntag der Woche (13.9.2026)? */
function fehlt(over: Partial<AppState>): boolean {
  const state: AppState = { ...demoZustand(), weeks: [WOCHE], absences: [], ...over }
  let ergebnis = false
  function Probe() {
    ergebnis = istAbwesend(useAbwesend(), 'p4', 0, 'we')
    return null
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={vi.fn()}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <Probe />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  render(<Buehne />)
  return ergebnis
}

afterEach(cleanup)

describe('useAbwesend', () => {
  it('wer am Tag der Zusammenkunft abwesend ist, steht ihr nicht zur Verfügung', () => {
    const absences = [{ id: 'a', personId: 'p4', userId: null, from: '2026-09-13', to: '2026-09-13', reason: '' }]
    expect(fehlt({ absences })).toBe(true)
  })

  it('sonst steht er zur Verfügung', () => {
    expect(fehlt({})).toBe(false)
  })
})
