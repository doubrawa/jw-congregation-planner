/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from './context'
import { useAbwesend, useAuswaerts } from './useAbwesend'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { istAbwesend } from '../data/absence'
import type { Week } from '../data/types'

/**
 * **Wer nicht zur Verfügung steht** — die eine Antwort für Zuteilungs-Blatt,
 * Engpass-Banner und Konfliktprüfung. Seit T120, Phase 4, gehört dazu, wer an
 * dem Tag als Redner in einer anderen Versammlung spricht; das Banner nennt
 * den Grund aus `useAuswaerts`.
 */

const leer = { date: '', end: '', helpers: {}, sections: [] }
const WOCHE: Week = { range: '', book: '', start: '2026-09-07', mid: { ...leer }, we: { ...leer } }

function frage(over: Partial<AppState>): { nicht: boolean; auswaerts: boolean } {
  const state: AppState = { ...demoZustand(), weeks: [WOCHE], absences: [], auswaerts: [], ...over }
  const ergebnis = { nicht: false, auswaerts: false }
  function Probe() {
    ergebnis.nicht = istAbwesend(useAbwesend(), 'p4', 0, 'we')
    ergebnis.auswaerts = istAbwesend(useAuswaerts(), 'p4', 0, 'we')
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
  it('wer am Sonntag auswärts spricht, steht der eigenen Zusammenkunft nicht zur Verfügung', () => {
    const vortrag = { id: 'v1', datum: '2026-09-13', zeit: '10:00', versammlung: 'Beispielheim', nummer: null, pid: 'p4' }
    expect(frage({ auswaerts: [vortrag] })).toEqual({ nicht: true, auswaerts: true })
  })

  it('wer abwesend ist, auch — aber nicht als Redner auswärts', () => {
    const absences = [{ id: 'a', personId: 'p4', userId: null, from: '2026-09-13', to: '2026-09-13', reason: '' }]
    expect(frage({ absences })).toEqual({ nicht: true, auswaerts: false })
  })

  it('sonst steht er zur Verfügung', () => {
    expect(frage({})).toEqual({ nicht: false, auswaerts: false })
  })
})
