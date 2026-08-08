/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { AppDispatchContext, AppStateContext, useAppDispatch, useAppState, useApp } from './context'
import type { AppState } from './context'
import { initialState } from './init'

/**
 * T41 — Zustand und Versand liegen in getrennten Kontexten.
 *
 * Vorher trugen sie ein gemeinsames Objekt. `dispatch` ist über die ganze
 * Sitzung dieselbe Funktion, das umgebende Objekt aber nicht: jede
 * Zustandsänderung erzeugte ein neues und rief damit auch die Bausteine auf den
 * Plan, die gar nichts lesen, sondern nur auslösen.
 *
 * Der Test misst genau das — wie oft rendert ein Baustein, der nur `dispatch`
 * nimmt, wenn sich der Zustand ändert? Er ist der Grund, warum die Trennung
 * beim nächsten Umbau nicht versehentlich wieder zusammenwächst.
 */

/** Provider, der seinen Zustand auf Zuruf ändert. */
function Buehne({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => initialState())
  // Stabil wie im echten Provider (dort ein `useCallback([])`). Ein bei jedem
  // Render neu erzeugtes `vi.fn()` wäre ein anderer Kontextwert und würde die
  // Trennung genau um das bringen, was sie leisten soll — der erste Testlauf
  // ist prompt darauf hereingefallen.
  const [dispatch] = useState(() => vi.fn())
  return (
    <AppDispatchContext.Provider value={dispatch}>
      <AppStateContext.Provider value={state}>
        <button type="button" onClick={() => setState((s) => ({ ...s, week: s.week + 1 }))}>
          weiter
        </button>
        {children}
      </AppStateContext.Provider>
    </AppDispatchContext.Provider>
  )
}

// Ohne Aufräumen stünden die Bühnen der vorigen Tests noch im Dokument.
afterEach(cleanup)

describe('Zustand und Versand sind getrennt', () => {
  it('wer nur auslöst, rendert bei einer Zustandsänderung nicht mit', () => {
    let renders = 0
    function NurVersand() {
      useAppDispatch()
      renders++
      return null
    }
    const { getByText } = render(
      <Buehne>
        <NurVersand />
      </Buehne>,
    )
    expect(renders).toBe(1)
    fireEvent.click(getByText('weiter'))
    // Ohne die Trennung stünde hier 2: das gemeinsame Objekt war neu, obwohl
    // `dispatch` dieselbe Funktion blieb.
    expect(renders).toBe(1)
  })

  it('wer liest, rendert sehr wohl mit', () => {
    let renders = 0
    function Liest() {
      useAppState()
      renders++
      return null
    }
    const { getByText } = render(
      <Buehne>
        <Liest />
      </Buehne>,
    )
    expect(renders).toBe(1)
    fireEvent.click(getByText('weiter'))
    expect(renders).toBe(2)
  })

  it('useApp liefert weiter beides', () => {
    // Der alte Weg bleibt gültig — 41 Bausteine nutzen ihn.
    let gesehen: { week: number; hatDispatch: boolean } | null = null
    function Beides() {
      const { state, dispatch } = useApp()
      gesehen = { week: state.week, hatDispatch: typeof dispatch === 'function' }
      return null
    }
    render(
      <Buehne>
        <Beides />
      </Buehne>,
    )
    expect(gesehen).toEqual({ week: initialState().week, hatDispatch: true })
  })
})

describe('Ohne Provider ist es ein Fehler, kein stiller Rückfall', () => {
  it('nennt den Provider beim Namen', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Nackt() {
      useAppState()
      return null
    }
    expect(() => render(<Nackt />)).toThrow(/AppProvider/)
    function NacktVersand() {
      useAppDispatch()
      return null
    }
    expect(() => render(<NacktVersand />)).toThrow(/AppProvider/)
    err.mockRestore()
  })
})
