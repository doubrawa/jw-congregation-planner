/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'

const { schritte, ankommen } = vi.hoisted(() => ({ schritte: [] as string[], ankommen: { jetzt: () => {} } }))

vi.mock('./persist', () => ({ ausstehendesSchreiben: () => schritte.push('hinaus') }))
vi.mock('../lib/schreiben-unterwegs', () => ({
  schreibenAbwarten: () =>
    new Promise<void>((weiter) => {
      schritte.push('warten')
      ankommen.jetzt = weiter
    }),
}))

import { neuLaden } from './neu-laden'

/*
 * Neu geladen wird erst, wenn hinaus ist, was gebündelt wartet, und angekommen,
 * was unterwegs ist — für eine neue Fassung der App wie für einen Anmelde-Link
 * in der schon offenen App. Sonst bräche das Neuladen die letzte Änderung ab.
 */
describe('neuLaden', () => {
  const echt = window.location
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: echt })
    schritte.length = 0
  })

  it('schickt erst hinaus, was wartet, wartet auf die Antwort — und lädt dann', async () => {
    const reload = vi.fn(() => schritte.push('laden'))
    Object.defineProperty(window, 'location', { configurable: true, value: { ...echt, reload } })
    const fertig = neuLaden()
    await Promise.resolve()
    expect(schritte).toEqual(['hinaus', 'warten'])
    expect(reload).not.toHaveBeenCalled()
    ankommen.jetzt()
    await fertig
    expect(schritte).toEqual(['hinaus', 'warten', 'laden'])
  })
})
