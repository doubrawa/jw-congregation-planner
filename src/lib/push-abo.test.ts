import { beforeEach, describe, expect, it, vi } from 'vitest'

const daten = vi.hoisted(() => ({
  deletePushSubscription: vi.fn(),
  pushAboEigen: vi.fn(),
  pushAboEintragen: vi.fn(),
}))
vi.mock('./data', () => daten)
const browser = vi.hoisted(() => ({ abo: null as PushSubscription | null }))
vi.mock('./push', async (importActual) => ({
  ...(await importActual<typeof import('./push')>()),
  vorhandenesAbo: async () => browser.abo,
}))

import { pushAboAbgleichen, pushAboLoesen } from './push-abo'

/** Ein Abo dieses Browsers, wie `PushSubscription` es liefert. */
function abo(endpoint = 'https://push.example/abc'): PushSubscription & { unsubscribe: ReturnType<typeof vi.fn> } {
  return {
    endpoint,
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
  } as unknown as PushSubscription & { unsubscribe: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  browser.abo = null
  daten.deletePushSubscription.mockResolvedValue(undefined)
})

/*
 * **Abmelden** (16.10.2026): Bis dahin blieb das Abo liegen. Der Nächste am
 * Gerät sah „Push an", bekam aber die Mitteilungen des Vorgängers.
 */
describe('pushAboLoesen', () => {
  it('löscht die eigene Zeile und beendet danach das Abo im Browser', async () => {
    const a = abo()
    browser.abo = a
    await pushAboLoesen()
    expect(daten.deletePushSubscription).toHaveBeenCalledWith('https://push.example/abc')
    expect(a.unsubscribe).toHaveBeenCalled()
    expect(daten.deletePushSubscription.mock.invocationCallOrder[0]).toBeLessThan(a.unsubscribe.mock.invocationCallOrder[0] ?? 0)
  })

  it('ohne Abo gibt es nichts zu lösen', async () => {
    await pushAboLoesen()
    expect(daten.deletePushSubscription).not.toHaveBeenCalled()
  })
})

/*
 * **Nach dem Anmelden** (16.10.2026): Nicht jeder Wechsel geht über das
 * Abmelden — ein Link meldet an, auch wenn schon jemand angemeldet ist.
 */
describe('pushAboAbgleichen', () => {
  it('das eigene Abo bleibt, wie es ist', async () => {
    const a = abo()
    browser.abo = a
    daten.pushAboEigen.mockResolvedValue(true)
    await pushAboAbgleichen('c1', 'uB', 'de')
    expect(daten.pushAboEintragen).not.toHaveBeenCalled()
    expect(a.unsubscribe).not.toHaveBeenCalled()
  })

  it('fehlt es in der Datenbank, wird es wieder eingetragen', async () => {
    const a = abo()
    browser.abo = a
    daten.pushAboEigen.mockResolvedValue(false)
    daten.pushAboEintragen.mockResolvedValue('eingetragen')
    await pushAboAbgleichen('c1', 'uB', 'fr')
    expect(daten.pushAboEintragen).toHaveBeenCalledWith('c1', 'uB', { endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' }, 'fr')
    expect(a.unsubscribe).not.toHaveBeenCalled()
  })

  it('führt es ein anderes Konto, endet es im Browser — der Schalter zeigt dann „aus"', async () => {
    const a = abo()
    browser.abo = a
    daten.pushAboEigen.mockResolvedValue(false)
    daten.pushAboEintragen.mockResolvedValue('fremd')
    await pushAboAbgleichen('c1', 'uB', 'de')
    expect(a.unsubscribe).toHaveBeenCalled()
  })

  it('geht die Frage nicht durch, bleibt alles, wie es ist', async () => {
    const a = abo()
    browser.abo = a
    daten.pushAboEigen.mockResolvedValue(null)
    await pushAboAbgleichen('c1', 'uB', 'de')
    expect(daten.pushAboEintragen).not.toHaveBeenCalled()
    expect(a.unsubscribe).not.toHaveBeenCalled()
  })
})
