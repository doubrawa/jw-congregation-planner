/** @vitest-environment happy-dom */
// happy-dom: Ohne Datenbank nimmt der Code die Adresse der Seite (`location`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EINMAL_MINUTEN } from '../../supabase/functions/_shared/anmeldung.ts'

/**
 * Die App-Seite des eigenen Zugangs: was sie der Function `anmelden`
 * schickt, wie sie die Antwort liest — und dass ohne Datenbank (Entwicklerseite)
 * ein Code in derselben Form entsteht.
 */

const invoke = vi.fn()
const client = { wert: true as boolean }

vi.mock('./supabase', () => ({
  get supabase() {
    return client.wert ? { functions: { invoke } } : null
  },
}))

const { einmalCodeHolen, sichtbarMs, zugangErneuern } = await import('./zugang')

/** Eine Antwort ≠ 2xx, wie `functions.invoke` sie liefert: der Rumpf hinter `error.context`. */
const abgewiesen = (body: unknown) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => body } },
})

const CODE = { ok: true, code: 'K7RD 2QWM', zettelUrl: 'https://app.test/#code=K7RD2QWM', gueltigBis: '2026-11-06T13:35:00.000Z' }

let fehler: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  client.wert = true
  invoke.mockReset()
  fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => fehler.mockRestore())

describe('ein Einmal-Code fürs nächste Gerät', () => {
  it('fragt die Function mit der Aktion „einmalcode" — die Person nennt sie nicht, die kommt aus der Sitzung', async () => {
    invoke.mockResolvedValue({ data: CODE, error: null })
    expect(await einmalCodeHolen()).toEqual(CODE)
    expect(invoke).toHaveBeenCalledWith('anmelden', { body: { aktion: 'einmalcode' } })
  })

  it('abgewiesen oder unvollständig: kein Code', async () => {
    invoke.mockResolvedValue(abgewiesen({ error: 'unauthorized' }))
    expect(await einmalCodeHolen()).toBeNull()
    invoke.mockResolvedValue({ data: { ok: true, code: 'K7RD 2QWM' }, error: null })
    expect(await einmalCodeHolen()).toBeNull()
  })

  it('ohne Datenbank: ein Code in derselben Form, mit Adresse und Frist', async () => {
    client.wert = false
    const vorher = Date.now()
    const r = (await einmalCodeHolen())!
    expect(r.code).toMatch(/^[A-HJ-NP-Z2-9]{4} [A-HJ-NP-Z2-9]{4}$/)
    expect(r.zettelUrl).toMatch(new RegExp(`#code=${r.code.replace(' ', '')}$`))
    expect(new Date(r.gueltigBis).getTime() - vorher).toBeGreaterThanOrEqual(EINMAL_MINUTEN * 60e3 - 1000)
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('Wie lange das Profil einen Code zeigt', () => {
  const JETZT = Date.UTC(2026, 10, 6, 13, 20)
  const in_ = (min: number) => new Date(JETZT + min * 60e3).toISOString()

  it('bis zu seiner Frist', () => {
    expect(sichtbarMs(in_(15), JETZT)).toBe(15 * 60e3)
    expect(sichtbarMs(in_(2), JETZT)).toBe(2 * 60e3)
  })

  it('geht die Uhr des Geräts vor, verschwindet er nicht sofort — die volle Dauer ab jetzt', () => {
    // Das Gerät meint, es sei 20 Minuten später: Die Frist läge schon zurück.
    expect(sichtbarMs(in_(15), JETZT + 20 * 60e3)).toBe(EINMAL_MINUTEN * 60e3)
  })

  it('geht sie nach, steht er nicht länger da, als er gilt', () => {
    expect(sichtbarMs(in_(15), JETZT - 30 * 60e3)).toBe(EINMAL_MINUTEN * 60e3)
  })
})

describe('Zugang erneuern', () => {
  it('fragt die Function mit der Aktion „erneuern" — `true`, wenn sie es getan hat', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    expect(await zugangErneuern()).toBe(true)
    expect(invoke).toHaveBeenCalledWith('anmelden', { body: { aktion: 'erneuern' } })
  })

  it('abgewiesen: `false`', async () => {
    invoke.mockResolvedValue(abgewiesen({ error: 'server-error' }))
    expect(await zugangErneuern()).toBe(false)
  })
})
