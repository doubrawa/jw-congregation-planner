/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { AppContext, type AppContextValue, type AppState, useApp } from '../app/context'
import { buildDemoWeeks } from '../data/demo'
import { fill, useProgWeek, useT } from './useT'

/** Provider-Wrapper mit einem Teil-State (useT liest nur lang/congLang). */
function wrapper(state: Partial<AppState>) {
  const ctx: AppContextValue = { state: state as AppState, dispatch: () => {} }
  return ({ children }: { children: React.ReactNode }) => (
    <AppContext.Provider value={ctx}>{children}</AppContext.Provider>
  )
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
