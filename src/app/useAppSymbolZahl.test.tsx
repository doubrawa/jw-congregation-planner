/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { demoZustand } from '../../tests/testdaten/demo-start'
import type { MyTask } from '../data/types'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from './context'
import { useAppSymbolZahl } from './useAppSymbolZahl'

/**
 * **Die Zahl am App-Symbol, solange die App offen ist** (T184): Sie zeigt, wie
 * viele eigene Aufgaben noch auf eine Antwort warten — gesetzt beim Laden und
 * nach jeder Antwort. Ist die App zu, setzt sie der Service Worker aus dem Push.
 */

const aufgabe = (id: string, status: MyTask['status']): MyTask => ({ id, title: '', rolle: 'Mikrofone', date: '', at: null, status, s89: null })

function zeige(over: Partial<AppState>) {
  const state: AppState = { ...demoZustand(), userId: 'u1', ...over }
  function Haken() {
    useAppSymbolZahl()
    return null
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={() => {}}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <Haken />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  render(<Buehne />)
}

function mitSymbol() {
  const setAppBadge = vi.fn(() => Promise.resolve())
  const clearAppBadge = vi.fn(() => Promise.resolve())
  Object.assign(navigator, { setAppBadge, clearAppBadge })
  return { setAppBadge, clearAppBadge }
}

afterEach(() => {
  cleanup()
  const nav = navigator as unknown as Record<string, unknown>
  delete nav.setAppBadge
  delete nav.clearAppBadge
})

describe('Die Zahl am App-Symbol (T184)', () => {
  it('zählt, was noch offen ist — Zusage und Absage sind eine Antwort', () => {
    const { setAppBadge } = mitSymbol()
    zeige({ myTasks: [aufgabe('a', 'offen'), aufgabe('b', 'offen'), aufgabe('c', 'bestätigt'), aufgabe('d', 'verhindert')] })
    expect(setAppBadge).toHaveBeenCalledWith(2)
  })

  it('nichts offen: das Symbol wird leer', () => {
    const { setAppBadge, clearAppBadge } = mitSymbol()
    zeige({ myTasks: [aufgabe('c', 'bestätigt')] })
    expect(clearAppBadge).toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('ohne Anmeldung ist das Symbol leer', () => {
    const { setAppBadge, clearAppBadge } = mitSymbol()
    zeige({ userId: null, myTasks: [aufgabe('a', 'offen')] })
    expect(clearAppBadge).toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('ein Browser ohne Zahl am Symbol übergeht es still', () => {
    expect(() => zeige({ myTasks: [aufgabe('a', 'offen')] })).not.toThrow()
  })

  it('…ebenso einer, der beim Setzen wirft oder kein Versprechen zurückgibt', () => {
    Object.assign(navigator, {
      setAppBadge: vi.fn(() => {
        throw new Error('nicht erlaubt')
      }),
      clearAppBadge: vi.fn(() => undefined),
    })
    expect(() => zeige({ myTasks: [aufgabe('a', 'offen')] })).not.toThrow()
    cleanup()
    expect(() => zeige({ myTasks: [] })).not.toThrow()
  })
})
