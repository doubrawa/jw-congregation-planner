/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import React from 'react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  useApp,
  useAppDispatch,
  useStaticStore,
} from '../app/context'
import { AppProvider } from '../app/store'
import { buildDemoWeeks } from '../data/testdaten'
import { dict } from './ui'
import { fill, useProgWeek, useT } from './useT'

// Die gerenderten Bühnen sonst im Dokument stehen — getByText fände dann
// mehrere Treffer.
afterEach(cleanup)

/**
 * Provider-Wrapper mit einem Teil-State (useT liest nur lang/congLang).
 *
 * Der Speicher gehört dazu: `useT` liest seit T41 über Selektoren, und die
 * gehen am Zustands-Kontext vorbei.
 */
function wrapper(state: Partial<AppState>) {
  return ({ children }: { children: React.ReactNode }) => {
    const store = useStaticStore(state as AppState)
    return (
      <AppDispatchContext.Provider value={() => {}}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state as AppState}>{children}</AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
}

describe('useApp', () => {
  it('wirft außerhalb eines Providers', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {}) // React-Render-Fehler stummschalten
    expect(() => renderHook(() => useApp())).toThrow(/AppProvider/)
    err.mockRestore()
  })
  it('liefert state/dispatch innerhalb des Providers', () => {
    const { result } = renderHook(() => useApp(), { wrapper: wrapper({ lang: 'de' }) })
    expect(result.current.state.lang).toBe('de')
    expect(typeof result.current.dispatch).toBe('function')
  })
})

describe('useT', () => {
  it('Deutsch: tu/tp sind Identität, kein Programm-Fallback', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrapper({ lang: 'de', congLang: 'Deutsch' }) })
    expect(result.current.tu('Lied 5')).toBe('Lied 5')
    expect(result.current.tp('Lied 5')).toBe('Lied 5')
    expect(result.current.progFallback).toBe(false)
    expect(typeof result.current.t).toBe('object')
  })

  it('Englisch (App + Versammlung): tu/tp übersetzen Programm-Inhalte', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrapper({ lang: 'en', congLang: 'Englisch' }) })
    expect(result.current.tu('Lied 5')).toBe('Song 5')
    expect(result.current.tp('Lied 5')).toBe('Song 5')
    expect(result.current.progFallback).toBe(false)
  })

  it('nicht unterstützte Versammlungssprache → progFallback, tp Identität', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrapper({ lang: 'de', congLang: 'Cebuano' }) })
    expect(result.current.progFallback).toBe(true)
    expect(result.current.tp('Lied 5')).toBe('Lied 5')
  })
})

describe('useProgWeek', () => {
  it('ohne Woche → tpw fällt auf tp zurück', () => {
    const { result } = renderHook(() => useProgWeek(undefined), { wrapper: wrapper({ lang: 'de', congLang: 'Deutsch' }) })
    expect(result.current.week).toBeUndefined()
    expect(result.current.tpw('Lied 5')).toBe('Lied 5')
  })

  it('Woche ohne passende Sprachvariante → dieselbe Woche, tpw = tp', () => {
    const week = buildDemoWeeks()[0]
    const { result } = renderHook(() => useProgWeek(week), { wrapper: wrapper({ lang: 'de', congLang: 'Deutsch' }) })
    expect(result.current.week).toBe(week)
    expect(result.current.tpw('Lied 5')).toBe('Lied 5')
  })
})

describe('fill (Sanity im Hook-Umfeld)', () => {
  it('ersetzt Platzhalter', () => {
    expect(fill('{n}x', { n: 2 })).toBe('2x')
  })
})

/*
 * Der eigentliche Ertrag von T41, gemessen.
 *
 * `useT` liest zwei Felder — `lang` und `congLang` —, hing aber über `useApp()`
 * am ganzen Zustand. 44 Bausteine nutzen den Hook: jede Aktion, gleich welche,
 * rief sie alle auf den Plan. Ein einzelner Tastendruck in einem Personenfeld
 * rendert damit die halbe Anwendung neu, obwohl sich an keiner Übersetzung
 * etwas geändert hat.
 *
 * Gemessen wird deshalb am **echten** Provider, mit echten Aktionen.
 */
describe('useT weckt nur die Sprache', () => {
  /** Baustein, der wie die 44 anderen nur übersetzen will. */
  function Uebersetzt({ zaehler }: { zaehler: { n: number } }) {
    const { t } = useT()
    zaehler.n++
    return <span>{t.autoZuteilen}</span>
  }

  function Ausloeser({ beschriftung, action }: { beschriftung: string; action: AppAction }) {
    const dispatch = useAppDispatch()
    return (
      <button type="button" onClick={() => dispatch(action)}>
        {beschriftung}
      </button>
    )
  }

  it('eine Aktion ohne Sprachbezug lässt ihn schlafen', () => {
    const zaehler = { n: 0 }
    const { getByText } = render(
      <AppProvider>
        <Uebersetzt zaehler={zaehler} />
        <Ausloeser beschriftung="wochenende" action={{ type: 'setTab', tab: 'we' }} />
      </AppProvider>,
    )
    expect(zaehler.n).toBe(1)
    fireEvent.click(getByText('wochenende'))
    // Über useApp() stünde hier 2 — und in der echten App 44-mal 2.
    expect(zaehler.n).toBe(1)
  })

  it('ein Sprachwechsel weckt ihn sehr wohl — und übersetzt', () => {
    const zaehler = { n: 0 }
    const { getByText } = render(
      <AppProvider>
        <Uebersetzt zaehler={zaehler} />
        <Ausloeser beschriftung="englisch" action={{ type: 'setLang', lang: 'en' }} />
      </AppProvider>,
    )
    const deutsch = dict('de').autoZuteilen
    expect(getByText(deutsch)).toBeTruthy()
    fireEvent.click(getByText('englisch'))
    expect(zaehler.n).toBe(2)
    expect(getByText(dict('en').autoZuteilen)).toBeTruthy()
  })
})
