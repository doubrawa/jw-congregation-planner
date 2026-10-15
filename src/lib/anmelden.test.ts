import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Die App-Seite der Function `anmelden` (T121, Phase 8): Was sie schickt, wie
 * sie die Antwort liest — und dass eine Sitzung erst gilt, wenn Supabase sie
 * übernommen hat.
 */

const invoke = vi.fn()
const setSession = vi.fn()
const client = { wert: true as boolean }

vi.mock('./supabase', () => ({
  get supabase() {
    return client.wert ? { functions: { invoke }, auth: { setSession } } : null
  },
}))

const { codePruefen, linkAnfordern, mitCodeAnmelden, mitLinkAnmelden } = await import('./anmelden')

/** Eine Antwort ≠ 2xx, wie `functions.invoke` sie liefert: der Rumpf hinter `error.context`. */
const abgewiesen = (body: unknown) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => body } },
})

const SITZUNG = { access_token: 'zugang', refresh_token: 'auffrischen' }

beforeEach(() => {
  client.wert = true
  invoke.mockReset()
  setSession.mockReset().mockResolvedValue({ error: null })
})

describe('mit dem Link anmelden', () => {
  it('schickt das Token und übernimmt die Sitzung', async () => {
    invoke.mockResolvedValue({ data: { ok: true, sitzung: SITZUNG }, error: null })
    expect(await mitLinkAnmelden('T'.repeat(43))).toBeNull()
    expect(invoke).toHaveBeenCalledWith('anmelden', { body: { aktion: 'link', token: 'T'.repeat(43) } })
    expect(setSession).toHaveBeenCalledWith(SITZUNG)
  })

  it.each(['ungueltig', 'abgelaufen', 'zu-viele'])('„%s" kommt als Grund zurück, ohne Sitzung', async (grund) => {
    invoke.mockResolvedValue(abgewiesen({ error: grund }))
    expect(await mitLinkAnmelden('T'.repeat(43))).toBe(grund)
    expect(setSession).not.toHaveBeenCalled()
  })

  it('ohne Antwort (Netz) und mit unbekanntem Grund (Server) bleibt es ein Fehler', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch', context: {} } })
    expect(await mitLinkAnmelden('x')).toBe('netz')
    invoke.mockResolvedValue(abgewiesen({ error: 'server-error' }))
    expect(await mitLinkAnmelden('x')).toBe('fehler')
    err.mockRestore()
  })

  it('eine Antwort ohne Sitzung meldet nicht an', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    expect(await mitLinkAnmelden('x')).toBe('fehler')
    expect(setSession).not.toHaveBeenCalled()
  })

  it('lehnt Supabase die Sitzung ab, ist man nicht angemeldet', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    invoke.mockResolvedValue({ data: { ok: true, sitzung: SITZUNG }, error: null })
    setSession.mockResolvedValue({ error: { message: 'Invalid Refresh Token' } })
    expect(await mitLinkAnmelden('x')).toBe('fehler')
    err.mockRestore()
  })
})

describe('mit dem Code anmelden', () => {
  it('erst prüfen: Name und Versammlung, ohne Sitzung', async () => {
    invoke.mockResolvedValue({ data: { ok: true, name: 'Anna Alt', versammlung: 'Musterstadt' }, error: null })
    expect(await codePruefen('K7RD2QWM')).toEqual({ ok: true, name: 'Anna Alt', versammlung: 'Musterstadt' })
    expect(invoke).toHaveBeenCalledWith('anmelden', { body: { aktion: 'code', code: 'K7RD2QWM', pruefen: true } })
    expect(setSession).not.toHaveBeenCalled()
  })

  it('dann anmelden', async () => {
    invoke.mockResolvedValue({ data: { ok: true, sitzung: SITZUNG }, error: null })
    expect(await mitCodeAnmelden('K7RD2QWM')).toBeNull()
    expect(invoke).toHaveBeenCalledWith('anmelden', { body: { aktion: 'code', code: 'K7RD2QWM' } })
    expect(setSession).toHaveBeenCalledWith(SITZUNG)
  })

  it('ein abgewiesener Code meldet den Grund', async () => {
    invoke.mockResolvedValue(abgewiesen({ error: 'abgelaufen' }))
    expect(await codePruefen('K7RD2QWM')).toEqual({ ok: false, fehler: 'abgelaufen' })
  })
})

describe('einen Link per E-Mail anfordern', () => {
  it('schickt Adresse und Sprache; die Antwort sagt nur „unterwegs"', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    expect(await linkAnfordern('wer@example.org', 'en')).toBe('unterwegs')
    expect(invoke).toHaveBeenCalledWith('anmelden', { body: { aktion: 'mail', email: 'wer@example.org', lang: 'en' } })
  })

  it('ohne eingerichteten Versand sagt sie es', async () => {
    invoke.mockResolvedValue({ data: { error: 'not-configured' }, error: null })
    expect(await linkAnfordern('wer@example.org', 'de')).toBe('nicht-eingerichtet')
  })
})

describe('ohne Datenbank', () => {
  it('ist Anmelden nachgestellt: jeder Weg gelingt, ohne Aufruf', async () => {
    client.wert = false
    expect(await mitLinkAnmelden('x')).toBeNull()
    expect(await mitCodeAnmelden('K7RD2QWM')).toBeNull()
    expect(await codePruefen('K7RD2QWM')).toEqual({ ok: true, name: '', versammlung: '' })
    expect(invoke).not.toHaveBeenCalled()
  })
})
