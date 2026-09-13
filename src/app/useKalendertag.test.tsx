/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKalendertag } from './useKalendertag'

/**
 * **Der heutige Tag als Abhängigkeit, die sich meldet.**
 *
 * Die Planungs-Karte und „Plan senden" merken sich, was sie gezählt haben. Das
 * Datum steht in dieser Rechnung, war aber keine Abhängigkeit — am Mittwochmorgen
 * zählten beide noch den Dienstag, solange niemand etwas an den Wochen änderte.
 * Eine installierte App bleibt dafür lange genug im Speicher: über Nacht im
 * Hintergrund, am Morgen wieder hervorgeholt.
 *
 * Verteidigt werden die beiden Anlässe, zu denen der Tag neu gelesen wird:
 * Mitternacht (App im Vordergrund) und das Zurückkehren (App aus dem
 * Hintergrund, wo das Betriebssystem Zeitgeber anhält).
 */

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useKalendertag', () => {
  it('liefert den örtlichen Kalendertag', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 8, 9, 0))
    const { result } = renderHook(() => useKalendertag())
    expect(result.current).toBe('2026-09-08')
  })

  it('springt um Mitternacht um, wenn die App offen steht', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 8, 23, 59, 30))
    const { result } = renderHook(() => useKalendertag())
    expect(result.current).toBe('2026-09-08')
    act(() => {
      vi.advanceTimersByTime(31_000)
    })
    expect(result.current).toBe('2026-09-09')
    // Und in der Nacht darauf wieder — der Zeitgeber stellt sich neu.
    act(() => {
      vi.advanceTimersByTime(24 * 3600_000)
    })
    expect(result.current).toBe('2026-09-10')
  })

  it('liest den Tag neu, wenn die App aus dem Hintergrund zurückkehrt', () => {
    // Nur das Datum gestellt: Der Zeitgeber zur Mitternacht läuft hier gar nicht
    // erst ab — wie im Hintergrund eines Telefons.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 21, 0))
    const { result } = renderHook(() => useKalendertag())
    vi.setSystemTime(new Date(2026, 8, 9, 7, 30))
    expect(result.current).toBe('2026-09-08') // noch nichts bemerkt
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-09-09')
  })

  it('bleibt der Tag derselbe, bleibt auch der Wert derselbe — kein Anlass zum Neurechnen', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 8, 9, 0))
    let renders = 0
    renderHook(() => {
      renders++
      return useKalendertag()
    })
    const vorher = renders
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(renders).toBe(vorher)
  })
})
