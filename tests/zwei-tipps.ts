import { fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { ZWEI_TIPP_SPERRE_MS } from '../src/components/useZweiTipp'

/**
 * **Der bestätigende Tipp** auf einen geschärften Zwei-Tipp-Knopf
 * (`useZweiTipp`): wie jemand, der die Frage gelesen hat.
 *
 * Der zweite Tipp zählt erst `ZWEI_TIPP_SPERRE_MS` nach dem Schärfen; zwei
 * Klicks unmittelbar hintereinander sind ein Doppelklick und bestätigen nicht.
 * Diese Hilfe stellt die Zeit für den einen Klick so weit vor, statt zu warten.
 */
export function bestaetigen(knopf: Element | null | undefined): void {
  if (!knopf) throw new Error('Kein Knopf zum Bestätigen')
  const spaeter = performance.now() + ZWEI_TIPP_SPERRE_MS
  const uhr = vi.spyOn(performance, 'now').mockReturnValue(spaeter)
  try {
    fireEvent.click(knopf)
  } finally {
    uhr.mockRestore()
  }
}
