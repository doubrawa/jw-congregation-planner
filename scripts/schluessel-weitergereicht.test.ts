import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * **Nach dem Schlüssel wird gefragt, wenn er gebraucht wird — und einmal**
 * (Review, scripts, 16.10.2026).
 *
 * - `versammlung-anlegen.mjs` fragte nach ihm, bevor es eine fehlende Angabe
 *   meldete, und auch für `--trocken`, das die Datenbank gar nicht berührt.
 * - `neuaufbau-fahren.mjs` fragte ihn ab und startete dann sechs Schritte als
 *   eigene Prozesse — ohne ihn. Stand er nicht in `.env.local`, fragte jeder
 *   Schritt noch einmal danach.
 */
const ZUGANG = { url: 'https://probe.supabase.co', key: 'sb_secret_probe_probe_probe_probe' }

vi.mock('./gemeinsam.mjs', async (orig) => {
  const echt = await orig<typeof import('./gemeinsam.mjs')>()
  return { ...echt, zugangsdaten: vi.fn(async () => ZUGANG) }
})
vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }))

const { zugangsdaten } = await import('./gemeinsam.mjs')
const { spawnSync } = await import('node:child_process')
const anlegen = await import('./versammlung-anlegen.mjs')
const neuaufbau = await import('./neuaufbau-fahren.mjs')

afterEach(() => {
  vi.mocked(zugangsdaten).mockClear()
  vi.mocked(spawnSync).mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('versammlung-anlegen: erst die Angaben, dann der Schlüssel', () => {
  it('eine fehlende Angabe meldet es, ohne nach dem Schlüssel zu fragen', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`)
    }) as never)
    await expect(anlegen.main(['--vorname', 'Anna', '--nachname', 'Beispiel'])).rejects.toThrow('exit 2')
    expect(fehler.mock.calls.flat().join(' ')).toContain('--name')
    expect(zugangsdaten).not.toHaveBeenCalled()
  })

  it('--trocken braucht keinen Schlüssel — es berührt die Datenbank nicht', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await anlegen.main(['--name', 'Musterstadt', '--vorname', 'Anna', '--nachname', 'Beispiel', '--trocken'])
    expect(zugangsdaten).not.toHaveBeenCalled()
  })
})

describe('neuaufbau-fahren: der Schlüssel geht an jeden Schritt', () => {
  it('jeder Schritt bekommt URL und Schlüssel mit, wie einmal erfragt', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // Der Bestand vor dem Lauf: keine Versammlung (eine Abfrage ins Leere).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })))
    await neuaufbau.main(['--ab-schritt', '2', '--sql', 'scripts/neuaufbau-fahren.mjs', '--trocken'])
    expect(zugangsdaten).toHaveBeenCalledTimes(1)
    const aufrufe = vi.mocked(spawnSync).mock.calls
    expect(aufrufe).toHaveLength(5)
    for (const [, , optionen] of aufrufe) {
      const env = (optionen as { env?: Record<string, string> }).env
      expect(env?.SUPABASE_SECRET_KEY).toBe(ZUGANG.key)
      expect(env?.SUPABASE_URL).toBe(ZUGANG.url)
    }
  })
})
