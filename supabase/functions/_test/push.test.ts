import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { antwortet, reset as resetPush } from './web-push.stub'
import { PUSH_FRIST_MS, type Zustellung, zustellen } from '../_shared/push.ts'

/*
 * Das Zustellen, das jede Function mit Push teilt. Ein Gerät darf den Lauf
 * nicht aufhalten und nicht zu Fall bringen: Nach dem Zustellen kommen die
 * Glocken und das Versand-Tagebuch.
 */

const zustellung = (endpoint: string): Zustellung => ({
  abo: { id: `abo-${endpoint}`, endpoint, p256dh: 'k', auth: 'a' },
  titel: 'Probe',
  body: 'Probe-Rumpf',
  url: 'https://app.test/',
})

beforeEach(() => {
  resetPush()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetPush()
})

describe('zustellen', () => {
  it('ein Dienst, der nicht antwortet, hält den Lauf nur bis zur Frist auf — die Zustellung ist gescheitert', async () => {
    vi.useFakeTimers()
    antwortet((endpoint) => (endpoint === 'stumm' ? new Promise<void>(() => {}) : Promise.resolve()))
    const lauf = zustellen([zustellung('stumm'), zustellung('da')], async () => {})
    await vi.advanceTimersByTimeAsync(PUSH_FRIST_MS)
    expect(await lauf).toEqual({ gesendet: 1, abgelaufen: 0, fehlgeschlagen: 1 })
  })

  it('vor der Frist zählt die Antwort, nicht die Frist', async () => {
    vi.useFakeTimers()
    antwortet(() => new Promise<void>((fertig) => setTimeout(fertig, PUSH_FRIST_MS - 1)))
    const lauf = zustellen([zustellung('langsam')], async () => {})
    await vi.advanceTimersByTimeAsync(PUSH_FRIST_MS)
    expect(await lauf).toEqual({ gesendet: 1, abgelaufen: 0, fehlgeschlagen: 0 })
  })

  it('scheitert das Abbestellen eines abgelaufenen Abos, gehen die übrigen trotzdem hinaus', async () => {
    antwortet((endpoint) => (endpoint === 'alt' ? Promise.reject(Object.assign(new Error('Gone'), { statusCode: 410 })) : Promise.resolve()))
    const abbestellen = vi.fn(async () => {
      throw new Error('Netz weg')
    })
    const erg = await zustellen([zustellung('alt'), zustellung('neu')], abbestellen)
    expect(erg).toEqual({ gesendet: 1, abgelaufen: 1, fehlgeschlagen: 0 })
    expect(abbestellen).toHaveBeenCalledWith('abo-alt')
  })
})
