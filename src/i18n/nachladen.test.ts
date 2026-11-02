import { describe, expect, it, vi } from 'vitest'
import { einmalNachladen } from './nachladen'

/**
 * **Wörterbücher und Sprachnamen nachladen** (2.11.2026): einmal je Sprache,
 * auch wenn mehrere zugleich fragen — und ein Fehlschlag bleibt nicht hängen.
 * Bis dahin bekam nach einem Wechsel der Sprache im Funkloch jeder weitere
 * Versuch dieselbe Ablehnung, bis die Seite neu lud.
 */
describe('einmal nachladen', () => {
  it('fragen zwei zugleich, lädt es einmal', async () => {
    const laufend = new Map<string, Promise<number>>()
    const laden = vi.fn(() => Promise.resolve(1))
    const [a, b] = await Promise.all([einmalNachladen(laufend, 'pl', laden), einmalNachladen(laufend, 'pl', laden)])
    expect([a, b]).toEqual([1, 1])
    expect(laden).toHaveBeenCalledTimes(1)
  })

  it('nach einem Fehlschlag lädt der nächste Versuch neu — statt dieselbe Ablehnung zu bekommen', async () => {
    const laufend = new Map<string, Promise<number>>()
    const laden = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(2)
    await expect(einmalNachladen(laufend, 'pl', laden)).rejects.toThrow('offline')
    expect(await einmalNachladen(laufend, 'pl', laden)).toBe(2)
    expect(laden).toHaveBeenCalledTimes(2)
  })

  it('fertig geladen steht nichts mehr in der Liste der laufenden', async () => {
    const laufend = new Map<string, Promise<number>>()
    await einmalNachladen(laufend, 'pl', () => Promise.resolve(3))
    expect(laufend.size).toBe(0)
  })

  it('jede Sprache für sich', async () => {
    const laufend = new Map<string, Promise<string>>()
    const laden = vi.fn((l: string) => Promise.resolve(l))
    await Promise.all([einmalNachladen(laufend, 'pl', () => laden('pl')), einmalNachladen(laufend, 'ru', () => laden('ru'))])
    expect(laden.mock.calls.map(([l]) => l).sort()).toEqual(['pl', 'ru'])
  })
})
