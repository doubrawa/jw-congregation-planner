/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useZweiTipp, ZWEI_TIPP_SPERRE_MS } from './useZweiTipp'

/**
 * **Zwei Tipps, kein Doppelklick** (Review vom 16.10.2026, Planen F8).
 *
 * Der erste Tipp schärft den Knopf, der zweite führt aus — aber erst
 * `ZWEI_TIPP_SPERRE_MS` nach dem ersten. Früher ist es noch derselbe
 * Doppelklick, und der Knopf bleibt geschärft. Was das am Zuteilen-Blatt
 * bedeutet, prüft `AssignSheet.test.tsx`.
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Knopf({ tun }: { tun: () => void }) {
  const zwei = useZweiTipp(tun)
  return (
    <button type="button" onClick={zwei.onClick} onBlur={zwei.onBlur}>
      {zwei.armed ? 'Wirklich?' : 'Löschen'}
    </button>
  )
}

/** Stellt die Uhr, die `useZweiTipp` liest. */
function uhr(ms: number): void {
  vi.spyOn(performance, 'now').mockReturnValue(ms)
}

describe('useZweiTipp: die Sperre nach dem Schärfen', () => {
  it('ein Tipp kurz vor ihrem Ende zählt nicht — der Knopf bleibt geschärft', () => {
    const tun = vi.fn()
    const { getByRole } = render(<Knopf tun={tun} />)
    uhr(10_000)
    fireEvent.click(getByRole('button'))
    uhr(10_000 + ZWEI_TIPP_SPERRE_MS - 1)
    fireEvent.click(getByRole('button'))
    expect(tun).not.toHaveBeenCalled()
    expect(getByRole('button').textContent).toBe('Wirklich?')
  })

  it('mit ihrem Ende führt der Tipp aus, und der Knopf ist wieder ruhig', () => {
    const tun = vi.fn()
    const { getByRole } = render(<Knopf tun={tun} />)
    uhr(10_000)
    fireEvent.click(getByRole('button'))
    uhr(10_000 + ZWEI_TIPP_SPERRE_MS)
    fireEvent.click(getByRole('button'))
    expect(tun).toHaveBeenCalledTimes(1)
    expect(getByRole('button').textContent).toBe('Löschen')
  })

  it('sie zählt ab dem Schärfen, nicht ab dem zu frühen Tipp', () => {
    // Wer im Doppelklick weitertippt, schiebt die Frage nicht hinaus.
    const tun = vi.fn()
    const { getByRole } = render(<Knopf tun={tun} />)
    uhr(10_000)
    fireEvent.click(getByRole('button'))
    uhr(10_200)
    fireEvent.click(getByRole('button'))
    uhr(10_000 + ZWEI_TIPP_SPERRE_MS)
    fireEvent.click(getByRole('button'))
    expect(tun).toHaveBeenCalledTimes(1)
  })
})
